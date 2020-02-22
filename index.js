import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import express from "express";
import YAML from "yaml";
import { EOL as eol } from "os";
import WebSocket from "ws";
import { createTask } from "./public/common.js";
import fetch from "node-fetch";

// Necessary due to type module is enabled: https://stackoverflow.com/a/50052194
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const writeTasks = async tasks => {
  await fs.writeFile(tasksFilePath, YAML.stringify(tasks), "utf-8");

  if (socket) {
    socket.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(tasks));
      }
    });
  }
};

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

const syncDryRun = async clientTasks => {
  const serverTasks = await readTasks();
  const changedTasksFromClient = [];
  const newTasksFromClient = [];
  clientTasks.forEach(clientTask => {
    if (
      !serverTasks.find(
        serverTask =>
          serverTask.id === clientTask.id && serverTask.text === clientTask.text
      )
    ) {
      newTasksFromClient.push(clientTask);
    } else if (
      serverTasks.find(
        serverTask =>
          serverTask.id === clientTask.id &&
          serverTask.text === clientTask.text &&
          serverTask.isDone !== clientTask.isDone
      )
    ) {
      changedTasksFromClient.push(clientTask);
    }
  });

  return { changedTasks: changedTasksFromClient, newTasks: newTasksFromClient };
};

const removeDuplicates = tasks =>
  tasks.reduce(
    (uniqueTasks, task) =>
      uniqueTasks.find(t => t.id === task.id && t.text === task.text)
        ? uniqueTasks
        : [...uniqueTasks, task],
    []
  );

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

const start = async () => {
  const tasksFileExists = await fs.pathExists(tasksFilePath);
  if (!tasksFileExists) {
    await writeTasks([]);
  }

  app.get("/u/:taskNo", async (req, res) => {
    await undone(req.params.taskNo);
    return res.redirect("/");
  });
  app.post("/undone", async (req, res) => {
    await undone(req.body.taskNo);
    return res.sendStatus(200);
  });

  app.get("/d/:taskNo", async (req, res) => {
    await done(req.params.taskNo);
    return res.redirect("/");
  });
  app.post("/done", async (req, res) => {
    await done(req.body.taskNo);
    return res.sendStatus(200);
  });

  app.get("/t/:taskNo", async (req, res) => {
    await move2top(req.params.taskNo);
    return res.redirect("/");
  });
  app.post("/move2top", async (req, res) => {
    await move2top(req.body.taskNo);
    return res.sendStatus(200);
  });

  app.get("/c", async (req, res) => {
    const { localAddress, remoteAddress } = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }
    await clear();
    return res.redirect("/");
  });
  app.post("/clear", async (req, res) => {
    const { localAddress, remoteAddress } = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }
    await clear();
    return res.sendStatus(200);
  });

  app.get("/a/:task", async (req, res) => {
    await append(req.params.task);
    return res.redirect("/");
  });
  app.post("/append", async (req, res) => {
    await append(req.body.task);
    return res.sendStatus(200);
  });

  app.get("/tasks", async (_, res) => {
    return res.send(await readTasks());
  });

  app.post("/sync", async (req, res) => {
    await sync(req.body);
    return res.sendStatus(200);
  });

  app.post("/sync-dry-run", async (req, res) => {
    return res.send(await syncDryRun(req.body));
  });

  app.get("/md", async (_, res) => {
    return res.send(await markdown());
  });

  app.get("/website-title", async (req, res) => {
    const response = await fetch(req.query.url);
    const html = await response.text();

    try {
      var title = html
        .split("</head>")[0]
        .split("<title>")[1]
        .split("</title>")[0];
      res.send(title);
    } catch {
      res.sendStatus(500);
    }
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
