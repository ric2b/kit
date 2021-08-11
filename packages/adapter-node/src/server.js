import { getRawBody } from '@sveltejs/kit/node'; // eslint-disable-line import/no-unresolved
import compression from 'compression';
import fs from 'fs';
import { dirname, join } from 'path';
import polka from 'polka';
import { parse } from '@polka/url';
import sirv from 'sirv';
import { fileURLToPath } from 'url';

// App is a dynamic file built from the application layer.

const __dirname = dirname(fileURLToPath(import.meta.url));
const noop_handler = (_req, _res, next) => next();
const paths = {
	assets: join(__dirname, '/assets'),
	prerendered: join(__dirname, '/prerendered')
};

export function createServer({ render }) {
	const prerendered_handler = fs.existsSync(paths.prerendered)
		? sirv(paths.prerendered, {
				etag: true,
				maxAge: 0,
				gzip: true,
				brotli: true
		  })
		: noop_handler;

	const assets_handler = fs.existsSync(paths.assets)
		? sirv(paths.assets, {
				setHeaders: (res, pathname, stats) => {
					// eslint-disable-next-line no-undef
					if (pathname.startsWith(APP_DIR)) {
						res.setHeader('cache-control', 'public, max-age=31536000, immutable');
					}
				},
				gzip: true,
				brotli: true
		  })
		: noop_handler;

	const server = polka();
	// Polka has a non-standard behavior of decoding the request path
	// Disable it so that adapter-node works just like the rest
	// SvelteKit will handle decoding URI components into req.params
	server.parse = (req) => {
		return parse(req, false);
	};
	server.use(
		compression({ threshold: 0 }),
		assets_handler,
		prerendered_handler,
		async (req, res) => {
			const parsed = new URL(req.url || '', 'http://localhost');

			let body;

			try {
				body = await getRawBody(req);
			} catch (err) {
				res.statusCode = err.status || 400;
				return res.end(err.reason || 'Invalid request body');
			}

			const rendered = await render({
				method: req.method,
				headers: req.headers, // TODO: what about repeated headers, i.e. string[]
				path: parsed.pathname,
				query: parsed.searchParams,
				rawBody: body
			});

			if (rendered) {
				res.writeHead(rendered.status, rendered.headers);
				if (rendered.body) res.write(rendered.body);
				res.end();
			} else {
				res.statusCode = 404;
				res.end('Not found');
			}
		}
	);

	return server;
}
