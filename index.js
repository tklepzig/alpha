const fs = require("fs-extra");
const path = require("path");
const bodyParser = require("body-parser");
const express = require("express");
const YAML = require("yaml");
const eol = require("os").EOL;
const app = express();
app.use(bodyParser.urlencoded({extended: true}));

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
  return writeTasks([...tasks, {text, isDone: false}]);
};

const prepend = async text => {
  const tasks = await readTasks();
  return writeTasks([{text, isDone: false}, ...tasks]);
};

const done = async taskNo => {
  const tasks = await readTasks();
  return writeTasks(
    tasks.map((task, i) =>
      i + 1 === parseInt(taskNo) ? {...task, isDone: true} : task
    )
  );
};

const undone = async taskNo => {
  const tasks = await readTasks();
  return writeTasks(
    tasks.map((task, i) =>
      i + 1 === parseInt(taskNo) ? {...task, isDone: false} : task
    )
  );
};

const clear = async () => {
  const tasks = await readTasks();
  return writeTasks(tasks.filter(task => !task.isDone));
};

const list = async () => {
  const tasks = await readTasks();
  return tasks.map((task, i) => ({...task, id: i + 1}));
};

const markdown = async () => {
  const tasks = await readTasks();
  return tasks
    .map(
      ({text, isDone}, i) =>
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

  app.get("/c", async (req, res) => {
    const {localAddress, remoteAddress} = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }
    await clear();
    return res.redirect("/");
  });
  app.post("/clear", async (req, res) => {
    const {localAddress, remoteAddress} = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }
    await clear();
    return res.sendStatus(200);
  });

  app.get("/p/:task", async (req, res) => {
    await prepend(req.params.task);
    return res.redirect("/");
  });
  app.post("/prepend", async (req, res) => {
    await prepend(req.body.task);
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
    return res.send(await list());
  });

  app.get("/md", async (_, res) => {
    return res.send(await markdown());
  });

  app.get("/", async (_, res) => {
    return res.sendFile(path.resolve(__dirname, "index.html"));
  });

  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
};

start();
