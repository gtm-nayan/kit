import * as devalue from 'devalue';
import { DEV } from 'esm-env';
import { client_method } from '../client/singletons.js';
import { invalidateAll } from './navigation.js';

export const applyAction = client_method('apply_action');

/** @type {import('$app/forms').deserialize} */
export function deserialize(result) {
	const parsed = JSON.parse(result);
	if (parsed.data) {
		parsed.data = devalue.parse(parsed.data);
	}
	return parsed;
}

/** @type {import('$app/forms').enhance} */
export function enhance(form, submit = () => {}) {
	if (
		DEV &&
		/** @type {HTMLFormElement} */ (HTMLFormElement.prototype.cloneNode.call(form)).method !==
			'post'
	) {
		throw new Error('use:enhance can only be used on <form> fields with method="POST"');
	}

	/**
	 * @param {{
	 *   action: URL;
	 *   result: import('types').ActionResult;
	 *   reset?: boolean
	 * }} opts
	 */
	const fallback_callback = async ({ action, result, reset }) => {
		if (result.type === 'success') {
			if (reset !== false) {
				// We call reset from the prototype to avoid DOM clobbering
				HTMLFormElement.prototype.reset.call(form);
			}
			await invalidateAll();
		}

		// For success/failure results, only apply action if it belongs to the
		// current page, otherwise `form` will be updated erroneously
		if (
			location.origin + location.pathname === action.origin + action.pathname ||
			result.type === 'redirect' ||
			result.type === 'error'
		) {
			applyAction(result);
		}
	};

	/** @param {SubmitEvent} event */
	async function handle_submit(event) {
		event.preventDefault();

		const action = new URL(
			// We can't do submitter.formAction directly because that property is always set
			// We do cloneNode for avoid DOM clobbering - https://github.com/sveltejs/kit/issues/7593
			event.submitter?.hasAttribute('formaction')
				? /** @type {HTMLButtonElement | HTMLInputElement} */ (event.submitter).formAction
				: /** @type {HTMLFormElement} */ (HTMLFormElement.prototype.cloneNode.call(form)).action
		);

		/** @type {FormData | string} */
		let data = new FormData(form);

		const submitter_name = event.submitter?.getAttribute('name');
		if (submitter_name) {
			data.append(submitter_name, event.submitter?.getAttribute('value') ?? '');
		}

		const controller = new AbortController();

		let cancelled = false;
		const cancel = () => (cancelled = true);

		const callback =
			(await submit({
				action,
				cancel,
				controller,
				data,
				form,
				submitter: event.submitter
			})) ?? fallback_callback;
		if (cancelled) return;

		/** @type {import('types').ActionResult} */
		let result;

		let encoding = HTMLFormElement.prototype.getAttribute.call(form, 'enctype');

		if (event.submitter?.hasAttribute('formenctype')) {
			encoding = event.submitter.getAttribute('formenctype');
		}

		encoding ??= 'application/x-www-form-urlencoded';

		const headers = {
			accept: 'application/json',
			'x-sveltekit-action': 'true',
			'content-type': encoding
		};

		if (encoding === 'text/plain') {
			// @ts-expect-error
			data = await new Blob(data).text();
		} else if (encoding === 'application/x-www-form-urlencoded') {
			// @ts-expect-error
			data = new URLSearchParams(data).toString();
		} else if (encoding === 'multipart/form-data') {
			// @ts-expect-error
			delete headers['content-type'];
		}

		try {
			const response = await fetch(action, {
				method: 'POST',
				headers: headers,
				cache: 'no-store',
				body: data,
				signal: controller.signal
			});

			result = deserialize(await response.text());
			if (result.type === 'error') result.status = response.status;
		} catch (error) {
			if (/** @type {any} */ (error)?.name === 'AbortError') return;
			result = { type: 'error', error };
		}

		callback({
			action,
			data,
			form,
			update: (opts) => fallback_callback({ action, result, reset: opts?.reset }),
			// @ts-expect-error generic constraints stuff we don't care about
			result
		});
	}

	// @ts-expect-error
	HTMLFormElement.prototype.addEventListener.call(form, 'submit', handle_submit);

	return {
		destroy() {
			// @ts-expect-error
			HTMLFormElement.prototype.removeEventListener.call(form, 'submit', handle_submit);
		}
	};
}
