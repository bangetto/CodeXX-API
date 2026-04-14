# CodeXX API

> This API is still in very early stages of development. So consider not using the API in production since things ~~might~~ **will change** in the future, and the documentations might not be up-to-date.

### Introducing the new CodeXX API

Here's how you can execute code in various languages on your own website for free (no, there's no fucking catch, it's literally free),

>This project is an unofficial contiunation of the [CodeX API by Jaagrav](https://github.com/Jaagrav/CodeX-API).

### Execute Code and fetch output

#### `POST` /

This endpoint allows you to execute your script and fetch output results.

### What are the Input Parameters for execute api call?

| Parameter  | Description                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| "code"     | The source code to execute (required)                                                                                          |
| "language" | Language identifier (e.g., "cpp") (required)                                                                                  |
| "input"    | Optional stdin input for the program                                                                                          |
| "tests"    | Optional array of test cases to run: `{input: string, output?: string}`                                                       |
| "mode"     | Test execution mode: `"runAll"` runs all tests, `"failFast"` stops on first failed test (optional)                              |

### What are the languages that are supported for execution?

Currently only C++ and Python3 is supported out of the box. However, the system is designed to be extensible - users can easily add their own languages by setting up a Docker image and updating `config.json`.

<details>
<summary>Adding new languages</summary>

To add a new language:

1. Create a Dockerfile based on the existing images
2. Add the language configuration to `config.json`
3. Build the image with `npm run build:images`

</details>

### NodeJS Example to Execute API Call?

```js
const response = await fetch('http://localhost:3000', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: '#include <iostream>\nusing namespace std;\nint main() { int val; cin >> val; cout << val + 5 << endl; return 0; }',
    language: 'cpp',
    input: '12'
  })
});

const result = await response.json();
console.log(result);
// { timeStamp: ..., status: 200, output: "17\n", error: "", language: "cpp", info: "g++ ..." }
```

### Sample Output

The output is a JSON object with the result and metadata.

```json
{
  "timeStamp": 1672439982964,
  "status": 200,
  "output": "17\n",
  "error": "",
  "language": "cpp",
  "info": "g++ (Ubuntu 7.5.0-3ubuntu1~18.04) 7.5.0"
}
```

### Running Tests

You can run multiple test cases with the `tests` and `mode` parameters:

```js
const response = await fetch('http://localhost:3000', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code: '#include <iostream>\nusing namespace std;\nint main() { int a, b; cin >> a >> b; cout << a + b << endl; return 0; }',
    language: 'cpp',
    tests: [
      { input: '1 2', output: '3' },
      { input: '5 10', output: '15' }
    ],
    mode: 'failFast'
  })
});

const result = await response.json();
console.log(result.testResults);
// [{ output: "3\n", passed: true }, { output: "15\n", passed: true }]
```



#### `GET` /list

This endpoint lists all supported languages and their versions.

```json
{
  "timeStamp": 1672440064864,
  "status": 200,
  "supportedLanguages": {
    "cpp": {
      "info": "g++ (Ubuntu 7.5.0-3ubuntu1~18.04) 7.5.0\nCopyright (C) 2017 Free Software Foundation, Inc.\nThis is free software; see the source for copying conditions.  There is NO\nwarranty; not even for MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.\n"
    }
  },
  "version": 1
}
```

#### `GET` /status

This endpoint returns server uptime and version information.

```json
{
  "timeStamp": 1672440064864,
  "status": 200,
  "uptime": 3600,
  "version": 1
}
```

> ~~This API is deployed on a free instance on [choreo](https://choreo.dev/) so shoutout to @wso2 for providing a platform that helped bringing back the CodeX API after a long down time. Since I am using a free tier, the API might be slow sometimes, so please be patient while I try to fund this project.~~

> This API is not deployed publicly, it is necessary to self-host it

### Getting Started

#### Prerequisites

- Node.js
- Docker or Podman

#### Installation

```bash
# Install dependencies
npm install

# Build TypeScript and Docker images
npm run build

# Or run separately:
npm run build:ts      # Compile TypeScript
npm run build:images # Build Docker/Podman images
```

#### Running

```bash
# Development mode (TypeScript)
npm run dev

# Production mode (compiled)
npm run start
```

The server runs on port 3000 by default (configurable via `PORT` environment variable).

Happy hacking!
