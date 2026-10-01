import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { fieldProperties } from './generated/fields';
import { operationProperties } from './generated/operations';
import { resourceProperties } from './generated/resources';

export class Openhandle implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Openhandle',
		name: 'openhandle',
		icon: { light: 'file:../../icons/openhandle.svg', dark: 'file:../../icons/openhandle.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Read public Instagram, TikTok, X, and Reddit data',
		defaults: {
			name: 'Openhandle',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'openhandleApi',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: 'https://api.openhandle.dev',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [...resourceProperties, ...operationProperties, ...fieldProperties],
	};
}
