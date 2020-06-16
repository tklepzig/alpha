import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import express from "express";
import YAML from "yaml";
import { EOL as eol } from "os";
import WebSocket from "ws";
import { createTask, createList } from "./public/common.js";
import fetch from "node-fetch";

import http from "http";
import https from "https";

// Necessary due to type module is enabled: https://stackoverflow.com/a/50052194
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let socket;
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const certificateDomain = "server";
const port = 3003;
const sslPort = port + 1;
const onlyLocalDelete = true;
const tasksFilePath = path.resolve(__dirname, "tasks.yaml");

const listsAreEqual = (listA, listB) =>
  listA.id === listB.id && listA.name === listB.name;

const tasksAreEqual = (taskA, taskB) =>
  taskA.id === taskB.id && taskA.text === taskB.text;

const readLists = async () => {
  const fileContent = await fs.readFile(tasksFilePath, "utf-8");
  return YAML.parse(fileContent);
};

const readTasks = async (listNo = 1) => {
  const fileContent = await fs.readFile(tasksFilePath, "utf-8");
  const lists = YAML.parse(fileContent);

  if (lists.length < +listNo) return [];
  return lists[+listNo - 1].tasks;
};

const writeLists = async (lists) => {
  await fs.writeFile(tasksFilePath, YAML.stringify(lists), "utf-8");

  if (socket) {
    socket.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(lists));
      }
    });
  }
};

const writeTasks = async (tasks, listNo = 1) => {
  const lists = await readLists();
  const updatedLists = lists.map((list, index) =>
    index + 1 === +listNo ? { ...list, tasks } : list
  );
  return writeLists(updatedLists);
};

const appendList = async (name) => {
  const lists = await readLists();
  return writeLists([...lists, createList(name)]);
};

const append = async (text, listNo = 1) => {
  const tasks = await readTasks(listNo);
  return writeTasks([...tasks, createTask(text)], listNo);
};

const move2top = async (taskNo, listNo = 1) => {
  const tasks = await readTasks(listNo);
  return writeTasks(
    tasks.reduce((result, task, i) => {
      if (i + 1 === parseInt(taskNo)) {
        result.unshift(task);
      } else {
        result.push(task);
      }
      return result;
    }, []),
    listNo
  );
};

const done = async (taskNo, listNo = 1) => {
  const tasks = await readTasks(listNo);
  return writeTasks(
    tasks.map((task, i) =>
      i + 1 === parseInt(taskNo) ? { ...task, isDone: true } : task
    ),
    listNo
  );
};

const undone = async (taskNo, listNo = 1) => {
  const tasks = await readTasks(listNo);
  return writeTasks(
    tasks.map((task, i) =>
      i + 1 === parseInt(taskNo) ? { ...task, isDone: false } : task
    ),
    listNo
  );
};

const clear = async () => {
  const lists = await readLists();
  const updatedLists = lists
    .map((list) => ({
      ...list,
      tasks: list.tasks.filter((task) => !task.isDone),
    }))
    .filter((list) => list.tasks.length > 0);
  return writeLists(updatedLists);
};

const syncDryRun = async (clientLists) => {
  const serverLists = await readLists();
  let result = "";

  if (serverLists.length === 0) return { result };

  for (const clientList of clientLists) {
    const serverList = serverLists.find((serverList) =>
      listsAreEqual(clientList, serverList)
    );

    const clientTaskNumbers = clientList.tasks
      .slice(0, serverList.tasks.length)
      .map(({ id, text }) => ({
        id,
        text,
      }));
    const serverTaskNumbers = serverList.tasks.map(({ id, text }) => ({
      id,
      text,
    }));
    for (var i = 0; i < clientTaskNumbers.length; i++) {
      if (!tasksAreEqual(clientTaskNumbers[i], serverTaskNumbers[i])) {
        result += `The order of tasks in list ${clientList.name} has changed.${eol}`;
        break;
      }
    }

    for (const clientTask of clientList.tasks) {
      const serverTask = serverList.tasks.find((st) =>
        tasksAreEqual(clientTask, st)
      );
      if (!serverTask) {
        // clientTask is new
        result += `Task ${clientTask.text} of list ${clientList.name} is new.${eol}`;
        continue;
      }

      if (serverTask.isDone !== clientTask.isDone) {
        // clientTask has changed
        result += `Task ${clientTask.text} of list ${
          clientList.name
        } has changed from ${serverTask.isDone ? "done" : "undone"} to ${
          clientTask.isDone ? "done" : "undone"
        }.${eol}`;
      }
    }
  }

  return { result };
};

const removeDuplicates = (tasks) =>
  tasks.reduce(
    (uniqueTasks, task) =>
      uniqueTasks.find((t) => t.id === task.id && t.text === task.text)
        ? uniqueTasks
        : [...uniqueTasks, task],
    []
  );

const sync = async (clientLists) => {
  const serverLists = await readLists();
  const newLists = [];
  for (var i = 0; i < serverLists.length; i++) {
    const clientTasks = clientLists.length > 0 ? clientLists[i].tasks : [];
    const serverTasks = serverLists.length > 0 ? serverLists[i].tasks : [];
    const uniqueTasks = removeDuplicates([...clientTasks, ...serverTasks]);
    newLists.push({ ...serverLists[i], tasks: uniqueTasks });
  }

  await writeLists(newLists);
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

const registerRoutes = () => {
  app.get("/u/:listNo?/:taskNo", async (req, res) => {
    await undone(req.params.taskNo, req.params.listNo);
    return res.redirect("/");
  });
  app.post("/undone", async (req, res) => {
    await undone(req.body.taskNo, req.body.listNo);
    return res.sendStatus(200);
  });

  app.get("/d/:listNo?/:taskNo", async (req, res) => {
    await done(req.params.taskNo, req.params.listNo);
    return res.redirect("/");
  });
  app.post("/done", async (req, res) => {
    await done(req.body.taskNo, req.body.listNo);
    return res.sendStatus(200);
  });

  app.get("/t/:listNo?/:taskNo", async (req, res) => {
    await move2top(req.params.taskNo, req.params.listNo);
    return res.redirect("/");
  });
  app.post("/move2top", async (req, res) => {
    await move2top(req.body.taskNo, req.body.listNo);
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

  app.get("/a/:listNo?/:task", async (req, res) => {
    await append(req.params.task, req.params.listNo);
    return res.redirect("/");
  });
  app.post("/append", async (req, res) => {
    await append(req.body.task, req.body.listNo);
    return res.sendStatus(200);
  });

  app.get("/al/:name", async (req, res) => {
    await appendList(req.params.name);
    return res.redirect("/");
  });
  app.post("/append-list", async (req, res) => {
    await appendList(req.body.name);
    return res.sendStatus(200);
  });

  app.get("/lists", async (_, res) => {
    return res.send(await readLists());
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
        .split(/<\/head.*?>/)[0]
        .split(/<title.*?>/)[1]
        .split(/<\/title.*?>/)[0];
      res.send(title);
    } catch {
      res.sendStatus(500);
    }
  });

  app.use(express.static(path.resolve(__dirname, "public")));
  app.get("/", async (_, res) => {
    return res.sendFile(path.resolve(__dirname, "public", "index.html"));
  });
};

const start = async () => {
  const tasksFileExists = await fs.pathExists(tasksFilePath);
  if (!tasksFileExists) {
    await writeLists([{ name: "default", tasks: [] }]);
  }

  registerRoutes();

  socket = new WebSocket.Server({ noServer: true });

  const httpServer = http.createServer(app);
  httpServer.on("upgrade", (req, sock, head) => {
    socket.handleUpgrade(req, sock, head, (ws) =>
      socket.emit("connection", ws)
    );
  });

  httpServer.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });

  if (
    (await fs.exists(`certificates/${certificateDomain}.key`)) &&
    (await fs.exists(`certificates/${certificateDomain}.crt`))
  ) {
    var privateKey = fs.readFileSync(
      path.resolve(__dirname, `certificates/${certificateDomain}.key`),
      "utf8"
    );
    var certificate = fs.readFileSync(
      path.resolve(__dirname, `certificates/${certificateDomain}.crt`),
      "utf8"
    );

    const httpsServer = https.createServer(
      { key: privateKey, cert: certificate },
      app
    );
    httpsServer.on("upgrade", (req, sock, head) => {
      socket.handleUpgrade(req, sock, head, (ws) =>
        socket.emit("connection", ws)
      );
    });

    httpsServer.listen(sslPort, () => {
      console.log(`Listening on ssl port ${sslPort}`);
    });
  }
};

start();
