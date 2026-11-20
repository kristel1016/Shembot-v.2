const debugPort = process.env.CHROME_DEBUG_PORT || "9222";
const targetUrl = process.argv[2] || "http://127.0.0.1:4173/";
const tabs = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) =>
  response.json()
);
const tab = tabs.find((item) => item.type === "page");
if (!tab) throw new Error("No Chrome page target was found");

const socket = new WebSocket(tab.webSocketDebuggerUrl);
const pending = new Map();
const consoleMessages = [];
let nextId = 1;

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled") {
    consoleMessages.push({
      type: message.params.type,
      values: message.params.args.map((arg) => arg.value ?? arg.description),
    });
  }
  if (message.method === "Runtime.exceptionThrown") {
    consoleMessages.push({
      type: "exception",
      values: [message.params.exceptionDetails.text],
    });
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result.value;
}

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: targetUrl });

for (let attempt = 0; attempt < 60; attempt += 1) {
  await wait(500);
  const ready = await evaluate(
    "Boolean(document.querySelector('#startButton') && !document.querySelector('#startButton').disabled)",
  );
  if (ready) break;
}

await evaluate("document.querySelector('#startButton').click(); true");
await wait(12000);
const state = await evaluate(`({
  error: document.querySelector('#errorMessage').hidden
    ? ''
    : document.querySelector('#errorMessage').textContent,
  status: document.querySelector('#appStatusLabel').textContent,
  count: document.querySelector('#countValue').textContent,
  fps: document.querySelector('#fpsValue').textContent,
  running: document.querySelector('#startButton').classList.contains('is-running'),
})`);
await evaluate("document.querySelector('#startButton').click(); true");
await wait(500);
state.stopControlResponded = await evaluate(
  "!document.querySelector('#startButton').classList.contains('is-running')",
);

console.log(JSON.stringify({ state, consoleMessages }, null, 2));
socket.close();
