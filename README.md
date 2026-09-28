# RESTFul-Time-API
Relatively barebones RESTful API implementing time as Javascript does: as the measure of milliseconds elapsed since 1 January 1970 00:00:00 UTC

## Implementations

Each implementation is isolated with its own source files, dependencies, and local configuration:

- `js/` contains the JavaScript and TypeScript servers, legacy Restify example, Mongo/Redis adapters, and Node manifests.
- `go/` contains the Go server and Go module files.
- `python/` contains the standard-library Python server and its tests.

### JavaScript / TypeScript

```sh
cd js
npm install
npm run start:js
```

Use `npm run start:ts` for the TypeScript server. The JavaScript server expects `PORT`, `MONGODB_URI`, and the Redis environment variables documented by its source configuration.

### Go

```sh
cd go
go run .
```

### Python

The standard-library Python implementation is in `python/python_api.py`. It serves the same CRUD contract as the JavaScript and Go implementations:

- `GET /` and `GET /ping` return `{ "message": "pong", "ts": <milliseconds> }`.
- `GET /time` lists entries.
- `POST /time` creates an entry from a JSON body.
- `GET`, `PUT`, and `DELETE /time/:id` operate on a 24-character hexadecimal ID.
- `GET /time/:id?zone=America%2FNew_York` converts the returned time to an IANA timezone.

Run it with Python 3.11 or newer:

```sh
PORT=3000 python3 python/python_api.py
```

By default data is stored in `python/time_api.sqlite3`. Set `TIME_API_DB` to choose another SQLite path. The test suite uses an in-memory store and requires no external services:

```sh
python3 -m unittest -v discover -s python
```
