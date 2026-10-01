import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const input = resolve(packageRoot, argumentValue('--input') ?? 'openapi/openhandle.json');
const outputDirectory = 'nodes/Openhandle/generated';

const excludedPaths = ['/v1/test-data', '/v1/test-data/{id}'];
const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];

const resourceLabels = {
	instagram: 'Instagram',
	reddit: 'Reddit',
	tiktok: 'TikTok',
	twitter: 'X',
	url: 'URL',
};

const defaultOperations = {
	instagram: 'instagram.profile.get',
	reddit: 'reddit.profile.get',
	tiktok: 'tiktok.profile.get',
	twitter: 'twitter.profile.get',
	url: 'fetch',
};

const parameterNames = {
	comment: { name: 'commentText', displayName: 'Comment Text' },
	comment_id: { name: 'commentId', displayName: 'Comment ID' },
	depth: { name: 'depth', displayName: 'Depth' },
	freshness: { name: 'freshness', displayName: 'Freshness' },
	identifier: { name: 'identifier', displayName: 'Identifier' },
	ids: { name: 'ids', displayName: 'IDs' },
	limit: { name: 'limit', displayName: 'Limit' },
	media_id: { name: 'mediaId', displayName: 'Media ID' },
	page: { name: 'page', displayName: 'Wiki Page' },
	playlist_id: { name: 'playlistId', displayName: 'Playlist ID' },
	q: { name: 'searchQuery', displayName: 'Search Query' },
	since: { name: 'since', displayName: 'Since' },
	sort: { name: 'sort', displayName: 'Sort' },
	subreddit: { name: 'subreddit', displayName: 'Subreddit' },
	t: { name: 'timeWindow', displayName: 'Time Window' },
	type: { name: 'mediaType', displayName: 'Media Type' },
	url: { name: 'url', displayName: 'URL' },
};

const propertyOrder = [
	'identifier',
	'commentId',
	'playlistId',
	'page',
	'url',
	'searchQuery',
	'mediaId',
	'commentText',
	'ids',
	'mediaType',
	'freshness',
	'returnAll',
	'maxPages',
	'options',
];

const enumLabels = {
	all: 'All Time',
	qa: 'Q&A',
};

const freshnessOptions = {
	live: { name: 'Live', description: 'Read the platform now. Costs $0.0025 per answered request.' },
	'24h': {
		name: '24 Hours',
		description: 'Accept data up to 24 hours old. Costs $0.0005 per answered request.',
	},
	'7d': {
		name: '7 Days',
		description: 'Accept data up to 7 days old. Costs $0.0001 per answered request.',
	},
	'30d': { name: '30 Days', description: 'Accept data up to 30 days old. Free.' },
};

const freshnessDescription =
	'How old the data may be. Older cached answers cost less, and 30-day answers are free.';

const identifierHints = {
	'reddit.profile':
		'Username with an @ prefix, or a t2_ profile ID. A t2_ ID works only after the profile was read by username once.',
	domain: 'Hostname, such as github.com',
	subreddit: 'Community name without r/',
};

const descriptionOverrides = {
	since: 'Return posts captured at or after this time',
};

const summaryOverrides = {
	'Get post oEmbed data': 'Get post embed data',
};

const smallWords = new Set([
	'a',
	'an',
	'and',
	'as',
	'at',
	'but',
	'by',
	'for',
	'if',
	'in',
	'nor',
	'of',
	'on',
	'or',
	'per',
	'so',
	'the',
	'to',
	'up',
	'via',
	'with',
	'yet',
]);
const articles = new Set(['a', 'an', 'the']);

const document = JSON.parse(readFileSync(input, 'utf8'));
const operations = operationDefinitions(document);

writeGenerated(
	`${outputDirectory}/resources.ts`,
	source(
		"import type { INodeProperties } from 'n8n-workflow';",
		`export const resourceProperties: INodeProperties[] = ${literal([resourceProperty(operations)])};`,
	),
);
writeGenerated(
	`${outputDirectory}/operations.ts`,
	source(
		"import type { INodeProperties } from 'n8n-workflow';",
		`export const operationProperties: INodeProperties[] = ${literal(operationProperties(operations))};`,
	),
);
writeGenerated(
	`${outputDirectory}/fields.ts`,
	source(
		"import type { INodeProperties } from 'n8n-workflow';\nimport { paginateByCursor } from '../shared/pagination';",
		`export const fieldProperties: INodeProperties[] = ${literal(fieldProperties(operations))};`,
	),
);

function operationDefinitions(openapi) {
	const result = [];
	for (const [apiPath, pathItem] of Object.entries(openapi.paths ?? {})) {
		if (excludedPaths.includes(apiPath)) {
			continue;
		}
		for (const [method, operation] of Object.entries(pathItem)) {
			if (!httpMethods.includes(method)) {
				continue;
			}
			const sdk = operation['x-openhandle-sdk'];
			if (!sdk || typeof sdk.path !== 'string' || !Array.isArray(sdk.scope)) {
				throw new Error(
					`${method.toUpperCase()} ${apiPath} has no valid x-openhandle-sdk mapping.`,
				);
			}
			const resource = sdk.scope[0]?.name ?? 'url';
			if (!resourceLabels[resource]) {
				throw new Error(`${sdk.path} has unknown resource ${resource}.`);
			}
			result.push({
				apiPath,
				method,
				value: sdk.path,
				resource,
				paginated: sdk.paginated === true,
				collection: responseIsCollection(operation),
				scope: sdk.scope,
				summary: operation.summary ?? sdk.path,
				description: operation.description ?? '',
				parameters: operationParameters(operation, sdk.scope),
			});
		}
	}
	result.sort((left, right) => left.value.localeCompare(right.value));
	return result;
}

function responseIsCollection(operation) {
	const schema = operation.responses?.['200']?.content?.['application/json']?.schema;
	const data = (schema?.allOf ?? []).map((part) => part.properties?.data).find(Boolean);
	return data?.type === 'array';
}

function operationParameters(operation, scope) {
	const parameters = [];
	for (const parameter of operation.parameters ?? []) {
		if (parameter.$ref) {
			throw new Error(`Parameter references are not supported: ${parameter.$ref}`);
		}
		if (parameter.name === 'cursor') {
			continue;
		}
		const reference = scope.find((segment) => segment.parameter === parameter.name)?.reference;
		parameters.push({
			apiName: parameter.name,
			location: parameter.in,
			required: parameter.required === true,
			schema: parameter.schema ?? {},
			description: parameter.description ?? '',
			reference,
		});
	}
	const body = operation.requestBody?.content?.['application/json']?.schema;
	for (const [name, schema] of Object.entries(body?.properties ?? {})) {
		parameters.push({
			apiName: name,
			location: 'body',
			required: (body.required ?? []).includes(name),
			schema,
			description: schema.description ?? '',
		});
	}
	return parameters;
}

function resourceProperty(definitions) {
	const resources = [...new Set(definitions.map((definition) => definition.resource))];
	return {
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: sortByName(
			resources.map((resource) => ({ name: resourceLabels[resource], value: resource })),
		),
		default: 'instagram',
	};
}

function operationProperties(definitions) {
	const byResource = groupBy(definitions, (definition) => definition.resource);
	const properties = [];
	for (const [resource, resourceOperations] of byResource) {
		const names = new Set();
		const options = resourceOperations.map((definition) => {
			const name = optionName(definition.summary);
			if (names.has(name)) {
				throw new Error(`Operation name ${name} is not unique for resource ${resource}.`);
			}
			names.add(name);
			return {
				name,
				value: definition.value,
				description: describe(operationDescription(definition)),
				action: actionText(definition.summary),
				routing: operationRouting(definition),
			};
		});
		const fallback = defaultOperations[resource];
		properties.push({
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			noDataExpression: true,
			displayOptions: { show: { resource: [resource] } },
			options: sortByName(options),
			default: options.some((option) => option.value === fallback)
				? fallback
				: sortByName(options)[0].value,
		});
	}
	return properties;
}

function operationRouting(definition) {
	const url = definition.apiPath.replace(/\{([^}]+)\}/g, (_, apiName) => {
		const parameter = definition.parameters.find((candidate) => candidate.apiName === apiName);
		if (!parameter || parameter.location !== 'path') {
			throw new Error(`${definition.value} has no path parameter ${apiName}.`);
		}
		return `{{encodeURIComponent(String($parameter["${parameterNames[apiName].name}"]).trim())}}`;
	});
	const routing = {
		request: {
			method: definition.method.toUpperCase(),
			url: url.includes('{{') ? `=${url}` : url,
		},
	};
	if (definition.collection) {
		routing.output = {
			postReceive: [
				{
					type: 'rootProperty',
					...(definition.paginated ? { enabled: '={{ !$parameter["returnAll"] }}' } : {}),
					properties: { property: 'data' },
				},
			],
		};
	}
	return routing;
}

function fieldProperties(definitions) {
	const variants = new Map();
	const optionSets = new Map();
	for (const definition of definitions) {
		const optional = [];
		for (const parameter of definition.parameters) {
			const isOptional =
				!parameter.required && parameter.location !== 'path' && parameter.apiName !== 'freshness';
			const property = fieldProperty(parameter, definition, isOptional);
			if (isOptional) {
				optional.push(property);
				continue;
			}
			addVariant(variants, property, definition);
		}
		if (definition.paginated) {
			addVariant(variants, returnAllProperty(), definition);
			addVariant(variants, maxPagesProperty(), definition);
		}
		if (optional.length > 0) {
			const options = sortByDisplayName(optional);
			addVariant(optionSets, optionsProperty(options), definition);
		}
	}
	const properties = [...variants.values(), ...optionSets.values()].map(
		({ property, operations: operationValues, resources }) => ({
			...property,
			displayOptions: mergeDisplayOptions(property.displayOptions, {
				resource: [...resources],
				operation: [...operationValues],
			}),
		}),
	);
	return properties
		.map((property, index) => ({ property, index }))
		.sort((left, right) => {
			const order = propertyRank(left.property.name) - propertyRank(right.property.name);
			return order !== 0 ? order : left.index - right.index;
		})
		.map(({ property }) => property);
}

function addVariant(variants, property, definition) {
	const key = JSON.stringify(property);
	const existing = variants.get(key) ?? { property, operations: new Set(), resources: new Set() };
	existing.operations.add(definition.value);
	existing.resources.add(definition.resource);
	variants.set(key, existing);
}

function mergeDisplayOptions(displayOptions, show) {
	return { ...(displayOptions ?? {}), show: { ...show, ...(displayOptions?.show ?? {}) } };
}

function propertyRank(name) {
	const index = propertyOrder.indexOf(name);
	if (index === -1) {
		throw new Error(`Property ${name} has no position in propertyOrder.`);
	}
	return index;
}

function fieldProperty(parameter, definition, isOptional) {
	const naming = parameterNames[parameter.apiName];
	if (!naming) {
		throw new Error(`Parameter ${parameter.apiName} of ${definition.value} has no n8n name.`);
	}
	const property = {
		displayName:
			parameter.location === 'path' ? pathDisplayName(parameter, naming) : naming.displayName,
		name: naming.name,
		...propertyType(parameter),
	};
	if (parameter.required) {
		property.required = true;
	}
	property.description = describe(parameterDescription(parameter, definition));
	if (parameter.apiName === 'identifier' && parameter.reference === 'profile') {
		property.placeholder = '@openai';
	}
	if (parameter.location !== 'path') {
		property.routing = { send: sendRouting(parameter, property, isOptional) };
	}
	return property;
}

function pathDisplayName(parameter, naming) {
	if (!parameter.reference) {
		return naming.displayName;
	}
	const label = titleWords(splitCamel(parameter.reference)).join(' ');
	return parameter.apiName.endsWith('_id') ? `${label} ID` : label;
}

function propertyType(parameter) {
	const schema = parameter.schema;
	if (parameter.apiName === 'freshness') {
		return {
			type: 'options',
			options: schema.enum.map((value) => {
				if (!freshnessOptions[value]) {
					throw new Error(`Freshness value ${value} has no label.`);
				}
				return { ...freshnessOptions[value], value };
			}),
			default: schema.default ?? '24h',
		};
	}
	if (Array.isArray(schema.enum)) {
		return {
			type: 'options',
			options: sortByName(schema.enum.map((value) => ({ name: enumLabel(value), value }))),
			default: schema.default ?? schema.enum[0],
		};
	}
	if (schema.type === 'integer' || schema.type === 'number') {
		const typeOptions = {};
		if (schema.minimum !== undefined) {
			typeOptions.minValue = schema.minimum;
		}
		if (schema.maximum !== undefined) {
			typeOptions.maxValue = schema.maximum;
		}
		const fallback = schema.default ?? schema.maximum ?? schema.minimum ?? 0;
		return { type: 'number', typeOptions, default: parameter.apiName === 'limit' ? 50 : fallback };
	}
	if (schema.format === 'date-time') {
		return { type: 'dateTime', default: '' };
	}
	if (schema.type === 'string') {
		return { type: 'string', default: '' };
	}
	throw new Error(
		`Parameter ${parameter.apiName} has unsupported schema ${JSON.stringify(schema)}.`,
	);
}

function sendRouting(parameter, property, isOptional) {
	const send = {
		type: parameter.location === 'body' ? 'body' : 'query',
		property: parameter.apiName,
	};
	if (property.type === 'dateTime') {
		send.value = '={{ $value ? new Date($value).toISOString() : undefined }}';
		return send;
	}
	if (property.type === 'string' && isOptional) {
		send.value = '={{ $value || undefined }}';
	}
	return send;
}

function parameterDescription(parameter, definition) {
	if (parameter.apiName === 'freshness') {
		return freshnessDescription;
	}
	if (parameter.apiName === 'limit') {
		return 'Max number of results to return';
	}
	if (descriptionOverrides[parameter.apiName]) {
		return descriptionOverrides[parameter.apiName];
	}
	if (parameter.apiName !== 'identifier') {
		return platformText(parameter.description);
	}
	const hint =
		identifierHints[`${definition.resource}.${parameter.reference}`] ??
		identifierHints[parameter.reference];
	if (hint) {
		return hint;
	}
	const sentences = splitSentences(parameter.description);
	if (parameter.reference === 'profile') {
		return upperFirst(
			sentences
				.find((sentence) => sentence.startsWith('Profile paths accept'))
				.replace('Profile paths accept a ', ''),
		);
	}
	if (parameter.reference === 'post') {
		const post = upperFirst(
			sentences
				.find((sentence) => sentence.startsWith('Post paths accept'))
				.replace('Post paths accept the ', ''),
		);
		return `${post} To read a post from its link, use the URL resource.`;
	}
	return `Native identifier of the ${splitCamel(parameter.reference).join(' ').toLowerCase()}`;
}

function returnAllProperty() {
	return {
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		routing: {
			send: { paginate: '={{ $value }}' },
			operations: { pagination: { __raw: 'paginateByCursor' } },
		},
	};
}

function maxPagesProperty() {
	return {
		displayName: 'Max Pages',
		name: 'maxPages',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 5,
		description:
			'The most pages to read when Return All is on. Each page is a separate request, and every page is billed.',
		displayOptions: { show: { returnAll: [true] } },
	};
}

function optionsProperty(options) {
	return {
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		options,
	};
}

function operationDescription(definition) {
	const kept = splitSentences(definition.description).filter(
		(sentence) =>
			!sentence.startsWith('Test and Live use') &&
			!sentence.startsWith('In Test,') &&
			!sentence.startsWith('URLs must be converted') &&
			!sentence.includes('find_test_data'),
	);
	return platformText(kept[0] ?? definition.summary);
}

function actionText(summary) {
	return platformText(summaryOverrides[summary] ?? summary).replace(
		/\b(Instagram|TikTok|X) (?!list\b)/g,
		'',
	);
}

function optionName(summary) {
	const words = actionText(summary)
		.split(/\s+/)
		.filter((word) => !articles.has(word.toLowerCase()));
	return titleWords(words).join(' ');
}

function titleWords(words) {
	return words.map((word, index) => {
		if (/[A-Z]/.test(word.slice(1)) || /^[A-Z]+$/.test(word)) {
			return word;
		}
		if (index > 0 && smallWords.has(word.toLowerCase())) {
			return word.toLowerCase();
		}
		return upperFirst(word);
	});
}

function enumLabel(value) {
	return enumLabels[value] ?? upperFirst(String(value));
}

function platformText(text) {
	return text
		.replace(/\bTiktok\b/g, 'TikTok')
		.replace(/\ba Twitter\b/g, 'an X')
		.replace(/\bTwitter\b/g, 'X');
}

function describe(text) {
	const trimmed = text.trim();
	if (splitSentences(trimmed).length > 1) {
		return trimmed.endsWith('.') ? trimmed : `${trimmed}.`;
	}
	return trimmed.replace(/\.$/, '');
}

function splitSentences(text) {
	return text
		.split(/(?<=\.)\s+(?=[A-Z])/)
		.map((sentence) => sentence.trim())
		.filter(Boolean);
}

function splitCamel(value) {
	return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/);
}

function upperFirst(value) {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function sortByName(options) {
	return [...options].sort((left, right) => left.name.localeCompare(right.name));
}

function sortByDisplayName(properties) {
	return [...properties].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function groupBy(items, keyOf) {
	const groups = new Map();
	for (const item of items) {
		const key = keyOf(item);
		groups.set(key, [...(groups.get(key) ?? []), item]);
	}
	return groups;
}

function literal(value, depth = 0) {
	const indent = '\t'.repeat(depth);
	const inner = '\t'.repeat(depth + 1);
	if (value === null) {
		return 'null';
	}
	if (typeof value === 'string') {
		return quote(value);
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return '[]';
		}
		const inline = `[${value.map((item) => literal(item)).join(', ')}]`;
		if (value.every((item) => typeof item !== 'object') && inline.length + depth * 2 < 90) {
			return inline;
		}
		return `[\n${value.map((item) => `${inner}${literal(item, depth + 1)},`).join('\n')}\n${indent}]`;
	}
	if (typeof value.__raw === 'string') {
		return value.__raw;
	}
	const entries = Object.entries(value).filter(([, item]) => item !== undefined);
	if (entries.length === 0) {
		return '{}';
	}
	return `{\n${entries.map(([key, item]) => `${inner}${propertyKey(key)}: ${literal(item, depth + 1)},`).join('\n')}\n${indent}}`;
}

function quote(value) {
	return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

function propertyKey(key) {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key);
}

function source(imports, body) {
	return `${generatedHeader()}${imports}\n\n${body}\n`;
}

function generatedHeader() {
	return '// Generated by scripts/generate.mjs from openapi/openhandle.json. Do not edit.\n\n';
}

function writeGenerated(relativePath, contents) {
	const target = resolve(packageRoot, relativePath);
	if (check) {
		let current = '';
		try {
			current = readFileSync(target, 'utf8');
		} catch {
			console.error(`${relativePath} is missing. Run npm run generate.`);
			process.exit(1);
		}
		if (current !== contents) {
			console.error(`${relativePath} is stale. Run npm run generate.`);
			process.exit(1);
		}
		return;
	}
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, contents);
}

function argumentValue(name) {
	const index = process.argv.indexOf(name);
	if (index === -1) {
		return undefined;
	}
	const value = process.argv[index + 1];
	if (!value || value.startsWith('--')) {
		throw new Error(`${name} requires a path.`);
	}
	return value;
}
