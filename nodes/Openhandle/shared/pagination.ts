import type {
	DeclarativeRestApiSettings,
	IDataObject,
	IExecutePaginationFunctions,
	INodeExecutionData,
} from 'n8n-workflow';

interface CursorPage {
	data?: IDataObject[];
	meta?: {
		cursors?: {
			next?: string | null;
		};
	};
}

export async function paginateByCursor(
	this: IExecutePaginationFunctions,
	requestData: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	const maxPages = this.getNodeParameter('maxPages', 5) as number;
	const items: INodeExecutionData[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < maxPages; page++) {
		const qs: IDataObject = { ...requestData.options.qs };
		if (cursor) {
			qs.cursor = cursor;
		}

		const responses = await this.makeRoutingRequest({
			...requestData,
			options: { ...requestData.options, qs },
		});
		const body = (responses[0]?.json ?? {}) as CursorPage;
		for (const entry of body.data ?? []) {
			items.push({ json: entry });
		}

		cursor = body.meta?.cursors?.next ?? undefined;
		if (!cursor) {
			break;
		}
	}

	return items;
}
