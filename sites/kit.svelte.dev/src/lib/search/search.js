import elasticlunr from 'elasticlunrjs';

export let inited = false;

/**
 * @type {import('elasticlunrjs').Index}
 */
let idx = elasticlunr(function () {
	this.addField('title').addField('content').setRef('href').saveDocument(false);
});

/** @type {Map<string, import('./types').Block>} */
const map = new Map();

/** @type {Map<string, string>} */
const hrefs = new Map();

/** @param {import('./types').Block[]} blocks */
export function init(blocks) {
	if (inited) return;

	for (const block of blocks) {
		if (!map.has(block.href)) {
			map.set(block.href, block);

			idx.addDoc({ href: block.href, title: block.breadcrumbs.join(' '), content: block.content });

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
	const blocks = idx
		.search(query, {
			fields: {
				title: { boost: 4, bool: 'AND' },
				content: { boost: 1 }
			},
			bool: 'OR',
			expand: true
		})
		.map((result) => /** @type {const} */ ([map.get(result.ref), result.score]))
		.sort((a, b) => {
			const [a_block, a_score] = a;
			const [b_block, b_score] = b;

			const a_rank = a_block.rank ?? 0;
			const b_rank = b_block.rank ?? 0;

			return a_rank - b_rank || b_score - a_score;
		})
		.map(([block]) => block);
	const results = tree([], blocks).children;

	return results;
}

/** @param {string} href */
export function lookup(href) {
	return map.get(href);
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

	return {
		breadcrumbs,
		href: hrefs.get(breadcrumbs.join('::')),
		node,
		children: Array.from(new Set(descendants.map((block) => block.breadcrumbs[depth])), (part) =>
			tree([...breadcrumbs, part], descendants)
		)
	};
}
