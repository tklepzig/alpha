const fs = require("fs-extra");
const path = require("path");
const bodyParser = require("body-parser");
const express = require("express");
const YAML = require("yaml");
const eol = require("os").EOL;
const WebSocket = require("ws");
const { createTask } = require("./public/common");

let socket;
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const port = 3003;
const onlyLocalDelete = true;
const tasksFilePath = path.resolve(__dirname, "tasks.yaml");

const readTasks = async () => {
  const fileContent = await fs.readFile(tasksFilePath, "utf-8");
  return YAML.parse(fileContent);
};

const writeTasks = tasks =>
  fs.writeFile(tasksFilePath, YAML.stringify(tasks), "utf-8");

const append = async text => {
  const tasks = await readTasks();
  return writeTasks([...tasks, createTask(text)]);
};

const move2top = async taskNo => {
  const tasks = await readTasks();
  return writeTasks(
    tasks.reduce((result, task, i) => {
      if (i + 1 === parseInt(taskNo)) {
        result.unshift(task);
      } else {
        result.push(task);
      }
      return result;
    }, [])
  );
};

const done = async taskNo => {
  const tasks = await readTasks();
  return writeTasks(
    tasks.map((task, i) =>
      i + 1 === parseInt(taskNo) ? { ...task, isDone: true } : task
    )
  );
};

const undone = async taskNo => {
  const tasks = await readTasks();
  return writeTasks(
    tasks.map((task, i) =>
      i + 1 === parseInt(taskNo) ? { ...task, isDone: false } : task
    )
  );
};

const clear = async () => {
  const tasks = await readTasks();
  return writeTasks(tasks.filter(task => !task.isDone));
};

const removeDuplicates = tasks =>
  tasks.reduce(
    (uniqueTasks, task) =>
      uniqueTasks.find(t => t.id === task.id && t.text === task.text)
        ? uniqueTasks
        : [...uniqueTasks, task],
    []
  );
const syncDryRun = async clientTasks => {
  const serverTasks = await readTasks();
  const newTasksFromClient = clientTasks.filter(
    clientTask =>
      !serverTasks.find(
        serverTask =>
          serverTask.id === clientTask.id && serverTask.text === clientTask.text
      )
  );
  return newTasksFromClient;
};

const sync = async clientTasks => {
  const serverTasks = await readTasks();
  const uniqueTasks = removeDuplicates([...clientTasks, ...serverTasks]);
  await writeTasks(uniqueTasks);
};

const markdown = async () => {
  const tasks = await readTasks();
  return tasks
    .map(
      ({ text, isDone }, i) =>
        `${isDone ? "~~" : ""}${i + 1} - ${text}${isDone ? "~~" : ""}`
    )
    .join(eol);
};

const broadcastTasks = async () => {
  const tasks = await readTasks();
  socket.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(tasks));
    }
  });
};

const start = async () => {
  const tasksFileExists = await fs.pathExists(tasksFilePath);
  if (!tasksFileExists) {
    await writeTasks([]);
  }

  app.get("/u/:taskNo", async (req, res) => {
    await undone(req.params.taskNo);
    await broadcastTasks();
    return res.redirect("/");
  });
  app.post("/undone", async (req, res) => {
    await undone(req.body.taskNo);
    await broadcastTasks();
    return res.sendStatus(200);
  });

  app.get("/d/:taskNo", async (req, res) => {
    await done(req.params.taskNo);
    await broadcastTasks();
    return res.redirect("/");
  });
  app.post("/done", async (req, res) => {
    await done(req.body.taskNo);
    await broadcastTasks();
    return res.sendStatus(200);
  });

  app.get("/t/:taskNo", async (req, res) => {
    await move2top(req.params.taskNo);
    await broadcastTasks();
    return res.redirect("/");
  });
  app.post("/move2top", async (req, res) => {
    await move2top(req.body.taskNo);
    await broadcastTasks();
    return res.sendStatus(200);
  });

  app.get("/c", async (req, res) => {
    const { localAddress, remoteAddress } = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }
    await clear();
    await broadcastTasks();
    return res.redirect("/");
  });
  app.post("/clear", async (req, res) => {
    const { localAddress, remoteAddress } = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }
    await clear();
    await broadcastTasks();
    return res.sendStatus(200);
  });

  app.get("/a/:task", async (req, res) => {
    await append(req.params.task);
    await broadcastTasks();
    return res.redirect("/");
  });
  app.post("/append", async (req, res) => {
    await append(req.body.task);
    await broadcastTasks();
    return res.sendStatus(200);
  });

  app.get("/tasks", async (_, res) => {
    return res.send(await readTasks());
  });

  app.post("/sync", async (req, res) => {
    await sync(req.body);
    await broadcastTasks();
    return res.sendStatus(200);
  });

  app.post("/sync-dry-run", async (req, res) => {
    return res.send(await syncDryRun(req.body));
  });

  app.get("/md", async (_, res) => {
    return res.send(await markdown());
  });

  app.use(express.static(path.resolve(__dirname, "public")));
  app.get("/", async (_, res) => {
    return res.sendFile(path.resolve(__dirname, "public", "index.html"));
  });

  const server = app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
  socket = new WebSocket.Server({ server });
};

start();
