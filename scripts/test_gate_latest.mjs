import handler from '../api/gate-latest.js';

function makeRes() {
  const headers = {};
  let statusCode = 200;
  let body;
  return {
    setHeader(k, v) { headers[k] = v; },
    status(code) { statusCode = code; return this; },
    json(obj) { body = obj; this._done = true; return this; },
    end() { this._done = true; return this; },
    _get() { return { statusCode, headers, body }; }
  };
}

async function run(query) {
  const req = { method: 'GET', query };
  const res = makeRes();
  await handler(req, res);
  return res._get();
}

const r0 = await run({ limit: '3', enrich: '0' });
console.log('enrich=0 status=', r0.statusCode);
console.log(JSON.stringify(r0.body, null, 2).slice(0, 2000));

const r1 = await run({ limit: '3', enrich: '1' });
console.log('\nenrich=1 status=', r1.statusCode);
console.log(JSON.stringify(r1.body, null, 2).slice(0, 2000));
