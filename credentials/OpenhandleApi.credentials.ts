import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OpenhandleApi implements ICredentialType {
	name = 'openhandleApi';

	displayName = 'Openhandle API';

	icon: Icon = { light: 'file:../icons/openhandle.svg', dark: 'file:../icons/openhandle.svg' };

	documentationUrl = 'https://openhandle.dev/docs/quickstart';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Create a key at <a href="https://app.openhandle.dev">app.openhandle.dev</a>. Keys that start with oh_live_ read real public data. Keys that start with oh_test_ return free synthetic data.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.openhandle.dev',
			url: '/v1/test-data',
			method: 'GET',
			qs: {
				limit: 1,
			},
		},
	};
}
