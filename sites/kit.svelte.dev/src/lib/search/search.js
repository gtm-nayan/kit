import MiniSearch from 'minisearch';

export let inited = false;

/** @type {MiniSearch<{ id: string, title: string, content: string }>} */
let index = new MiniSearch({
	fields: ['title', 'content'],

	searchOptions: {
		boost: { title: 3 },
		prefix: true,
		fuzzy: true,
	}
});

/** @type {Map<string, import('./types').Block>} */
const map = new Map();

/** @type {Map<string, string>} */
const hrefs = new Map();

/** @param {import('./types').Block[]} blocks */
export function init(blocks) {
	if (inited) return;

	for (const block of blocks) {
		const title = block.breadcrumbs.at(-1);

		if (!map.has(block.href)) { // Huh? Why are there duplicates?
			map.set(block.href, block);
			index.add({ id: block.href, title, content: block.content });
			hrefs.set(block.breadcrumbs.join('::'), block.href);
		}
	}

	inited = true;
}

/**
 * @param {string} query
 * @returns {import('./types').Block[]}
 */
export function search(query) {
	const blocks = index
		.search(query)
		.map((result) => /** @type {const} */ ([map.get(result.id), result.score]))
		.sort((a, b) => {
			const a_rank = ((a[0].rank | 0) + 1) ** 2;
			const b_rank = ((b[0].rank | 0) + 1) ** 2;

			return b[1] / b_rank - a[1] / a_rank; // ding the score for migrating et al.
		})
		.map(([block]) => block);

	const results = tree([], blocks).children;

	return results;
}

/**
 * @param {string[]} breadcrumbs
 * @param {import('./types').Block[]} blocks
 */
function tree(breadcrumbs, blocks) {
	const depth = breadcrumbs.length;

	const node = blocks.find((block) => {
		if (block.breadcrumbs.length !== depth) return false;
		return breadcrumbs.every((part, i) => block.breadcrumbs[i] === part);
	});

	const descendants = blocks.filter((block) => {
		if (block.breadcrumbs.length <= depth) return false;
		return breadcrumbs.every((part, i) => block.breadcrumbs[i] === part);
	});

	const child_parts = Array.from(new Set(descendants.map((block) => block.breadcrumbs[depth])));

	return {
		breadcrumbs,
		href: hrefs.get(breadcrumbs.join('::')),
		node,
		children: child_parts.map((part) => tree([...breadcrumbs, part], descendants))
	};
}
