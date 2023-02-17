import { init, search } from '../search/search.js';

addEventListener('message', async (event) => {
	const { type, payload } = event.data;

	if (type === 'init') {
		const res = await fetch(`${payload.origin}/content.json`);
		const { blocks } = await res.json();
		init(blocks);

		postMessage({ type: 'ready' });
	}

	if (type === 'query') {
		const query = payload;
		const results = search(query);

		postMessage({ type: 'results', payload: { results, query } });
	}

	if (type === 'recents') {
		postMessage({ type: 'recents', payload: [] });
	}
});
