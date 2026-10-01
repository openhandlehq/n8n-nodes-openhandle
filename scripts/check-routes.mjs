import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Openhandle } = require(resolve(packageRoot, 'dist/nodes/Openhandle/Openhandle.node.js'));
const { paginateByCursor } = require(
	resolve(packageRoot, 'dist/nodes/Openhandle/shared/pagination.js'),
);
const openapi = JSON.parse(readFileSync(resolve(packageRoot, 'openapi/openhandle.json'), 'utf8'));

const failures = [];
const properties = new Openhandle().description.properties;
const templatePattern =
	/\{\{encodeURIComponent\(String\(\$parameter\["([A-Za-z]+)"\]\)\.trim\(\)\)\}\}/g;
const sampleValue = '@open ai/1?x';

const specOperations = [];
for (const [apiPath, pathItem] of Object.entries(openapi.paths)) {
	for (const [method, operation] of Object.entries(pathItem)) {
		if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
			continue;
		}
		specOperations.push({ apiPath, method, operation, sdk: operation['x-openhandle-sdk'] });
	}
}

const operationOptions = [];
for (const property of properties.filter((candidate) => candidate.name === 'operation')) {
	for (const resource of property.displayOptions.show.resource) {
		for (const option of property.options) {
			operationOptions.push({ resource, option });
		}
	}
}

const counts = {};
for (const { resource, option } of operationOptions) {
	const label = `${resource} ${option.value}`;
	counts[resource] = (counts[resource] ?? 0) + 1;
	const method = option.routing?.request?.method?.toLowerCase();
	const template = String(option.routing?.request?.url ?? '').replace(/^=/, '');

	if (template.startsWith('/v1/test-data') || /^testData/.test(option.value)) {
		fail(label, 'exposes a synthetic test-data operation');
		continue;
	}

	const urlParameters = [...template.matchAll(templatePattern)].map((match) => match[1]);
	const substituted = template.replace(templatePattern, () => encodeURIComponent(sampleValue));
	if (substituted.includes('{{') || substituted.includes('$parameter')) {
		fail(label, `has an unrecognized URL template ${template}`);
		continue;
	}

	const candidates = specOperations.filter(
		(candidate) => candidate.method === method && pathPattern(candidate.apiPath).test(substituted),
	);
	const fewestParameters = Math.min(
		...candidates.map((candidate) => parameterCount(candidate.apiPath)),
	);
	const matches = candidates.filter(
		(candidate) => parameterCount(candidate.apiPath) === fewestParameters,
	);
	if (matches.length !== 1) {
		fail(
			label,
			`${method?.toUpperCase()} ${substituted} matches ${matches.length} OpenAPI operations`,
		);
		continue;
	}
	const spec = matches[0];
	if (spec.sdk.path !== option.value) {
		fail(
			label,
			`routes to ${spec.method.toUpperCase()} ${spec.apiPath}, which belongs to ${spec.sdk.path}`,
		);
	}

	const parameters = spec.operation.parameters ?? [];
	const pathParameters = parameters.filter((parameter) => parameter.in === 'path');
	if (pathParameters.length !== urlParameters.length) {
		fail(
			label,
			`uses ${urlParameters.length} URL parameters for ${pathParameters.length} path parameters`,
		);
	}
	for (const name of urlParameters) {
		const property = shownTopLevel(name, resource, option.value);
		if (!property) {
			fail(label, `has no property shown for path parameter ${name}`);
			continue;
		}
		if (property.required !== true || property.type !== 'string') {
			fail(label, `path property ${name} is not a required string`);
		}
	}

	for (const parameter of parameters.filter(
		(candidate) => candidate.in === 'query' && candidate.name !== 'cursor',
	)) {
		checkSentParameter(
			label,
			resource,
			option.value,
			parameter.name,
			'query',
			parameter.required === true,
		);
	}
	const body = spec.operation.requestBody?.content?.['application/json']?.schema;
	for (const name of Object.keys(body?.properties ?? {})) {
		checkSentParameter(
			label,
			resource,
			option.value,
			name,
			'body',
			(body.required ?? []).includes(name),
		);
	}

	const returnAll = shownTopLevel('returnAll', resource, option.value);
	const maxPages = shownTopLevel('maxPages', resource, option.value, { returnAll: true });
	if (spec.sdk.paginated === true) {
		if (!returnAll || returnAll.type !== 'boolean' || returnAll.default !== false) {
			fail(label, 'is paginated but has no Return All toggle that defaults to false');
		}
		if (typeof returnAll?.routing?.operations?.pagination !== 'function') {
			fail(label, 'Return All has no pagination handler');
		}
		if (!maxPages || maxPages.type !== 'number') {
			fail(label, 'is paginated but has no Max Pages field');
		}
	}
	if (spec.sdk.paginated !== true && returnAll) {
		fail(label, 'is not paginated but shows Return All');
	}

	const splitsData = (option.routing?.output?.postReceive ?? []).some(
		(action) => action.type === 'rootProperty' && action.properties?.property === 'data',
	);
	if (splitsData !== responseIsCollection(spec.operation)) {
		fail(
			label,
			splitsData ? 'splits a single resource response' : 'does not split its data array into items',
		);
	}
}

for (const spec of specOperations) {
	const isTestData = spec.apiPath.startsWith('/v1/test-data');
	const exposed = operationOptions.filter(({ option }) => option.value === spec.sdk.path);
	if (isTestData && exposed.length > 0) {
		fail(spec.sdk.path, 'test-data operation is exposed');
	}
	if (!isTestData && exposed.length !== 1) {
		fail(spec.sdk.path, `is exposed ${exposed.length} times`);
	}
}

await checkPagination();

const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
console.log(
	`Operations: ${total} (${Object.entries(counts)
		.map(([resource, count]) => `${resource} ${count}`)
		.join(', ')})`,
);
if (failures.length > 0) {
	console.error(
		`\n${failures.length} problems:\n${failures.map((failure) => `- ${failure}`).join('\n')}`,
	);
	process.exit(1);
}
console.log('All routes match the OpenAPI contract.');

function checkSentParameter(label, resource, operation, apiName, location, required) {
	const candidates = [];
	for (const property of properties) {
		if (!isShown(property, resource, operation)) {
			continue;
		}
		if (property.type === 'collection') {
			candidates.push(
				...(property.options ?? []).map((child) => ({ property: child, nested: true })),
			);
			continue;
		}
		candidates.push({ property, nested: false });
	}
	const match = candidates.find(
		({ property }) =>
			property.routing?.send?.property === apiName && property.routing.send.type === location,
	);
	if (!match) {
		fail(label, `has no property that sends ${location} parameter ${apiName}`);
		return;
	}
	if (required && (match.nested || match.property.required !== true)) {
		fail(label, `${location} parameter ${apiName} is required but its property is optional`);
	}
}

function shownTopLevel(name, resource, operation, values = {}) {
	return properties.find(
		(property) => property.name === name && isShown(property, resource, operation, values),
	);
}

function isShown(property, resource, operation, values = {}) {
	const show = property.displayOptions?.show ?? {};
	const current = { resource, operation, returnAll: false, ...values };
	return Object.entries(show).every(([key, allowed]) => allowed.includes(current[key]));
}

function parameterCount(apiPath) {
	return (apiPath.match(/\{/g) ?? []).length;
}

function pathPattern(apiPath) {
	const escaped = apiPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[^/]+');
	return new RegExp(`^${escaped}$`);
}

function responseIsCollection(operation) {
	const schema = operation.responses?.['200']?.content?.['application/json']?.schema;
	const data = (schema?.allOf ?? []).map((part) => part.properties?.data).find(Boolean);
	return data?.type === 'array';
}

async function checkPagination() {
	const pages = {
		'': { data: [{ id: 1 }, { id: 2 }], meta: { cursors: { next: 'page-2' } } },
		'page-2': { data: [{ id: 3 }], meta: { cursors: { next: 'page-3' } } },
		'page-3': { data: [{ id: 4 }], meta: { cursors: { next: null } } },
	};
	const run = async (maxPages) => {
		const requests = [];
		const context = {
			getNodeParameter: (name) => (name === 'maxPages' ? maxPages : undefined),
			makeRoutingRequest: async (requestData) => {
				requests.push(requestData.options.qs);
				return [{ json: pages[requestData.options.qs.cursor ?? ''] }];
			},
		};
		const items = await paginateByCursor.call(context, {
			options: { url: '/v1/example', qs: { freshness: '7d' } },
			preSend: [],
			postReceive: [],
		});
		return { ids: items.map((item) => item.json.id), requests };
	};

	const all = await run(10);
	if (all.ids.join(',') !== '1,2,3,4') {
		fail('pagination', `returned ${all.ids.join(',')} instead of 1,2,3,4`);
	}
	if (
		all.requests.length !== 3 ||
		all.requests[0].cursor !== undefined ||
		all.requests[2].cursor !== 'page-3'
	) {
		fail('pagination', `sent cursors ${JSON.stringify(all.requests)}`);
	}
	if (!all.requests.every((qs) => qs.freshness === '7d')) {
		fail('pagination', 'dropped other query parameters on later pages');
	}

	const capped = await run(2);
	if (capped.requests.length !== 2 || capped.ids.join(',') !== '1,2,3') {
		fail(
			'pagination',
			`did not stop at Max Pages: ${capped.requests.length} requests, items ${capped.ids.join(',')}`,
		);
	}
}

function fail(label, message) {
	failures.push(`${label}: ${message}`);
}
