const fs = require("fs-extra");
const path = require("path");
const bodyParser = require("body-parser");
const express = require("express");
const eol = require("os").EOL;
const app = express();
app.use(bodyParser.urlencoded({extended: true}));

const port = 3003;
const onlyLocalDelete = true;
const tasksFilePath = path.resolve(__dirname, "tasks");

const readTasks = () => fs.readFile(tasksFilePath, "utf-8")

const append = task =>
  fs.appendFile(tasksFilePath, `${task}${eol}`, {encoding: "utf-8"});

const prepend = async task => {
  const content = await readTasks();
  return fs.writeFile(tasksFilePath, `${task}${eol}${content}`, {encoding: "utf-8"});
}

const del = async taskNo => {
  const content = await readTasks();
  const tasks = content
    .split(eol)
    .filter((line, i) => line && i + 1 !== parseInt(taskNo))
    .join(eol);
  return fs.writeFile(tasksFilePath, `${tasks}${eol}`, {encoding: "utf-8"});
};

const list = async () => {
  const content = await readTasks();
  const tasks = content
    .split(eol)
    .filter(line => line)
    .map((line, i) => `${i + 1} - ${line}`)
    .join(eol);
  return tasks;
};

const start = async () => {
  await fs.ensureFile(tasksFilePath);

  app.get("/d/:taskNo", async (req, res) => {
    const {localAddress, remoteAddress} = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }

    await del(req.params.taskNo);
    return res.redirect("/");
  });
  app.delete("/", async (req, res) => {
    const {localAddress, remoteAddress} = req.connection;
    if (onlyLocalDelete && localAddress !== remoteAddress) {
      return res.sendStatus(403);
    }

    await del(req.body.taskNo);
    return res.redirect("/");
  });

  app.get("/p/:task", async (req, res) => {
    await prepend(req.params.task);
    return res.redirect("/");
  });
  app.post("/prepend", async (req, res) => {
    await prepend(req.body.task);
    return res.redirect("/");
  });

  app.get("/a/:task", async (req, res) => {
    await append(req.params.task);
    return res.redirect("/");
  });
  app.post("/append", async (req, res) => {
    await append(req.body.task);
    return res.redirect("/");
  });

  app.get("/list", async (_, res) => {
    return res.send(await list());
  });

  app.get("/", async (_, res) => {
    return res.sendFile(path.resolve(__dirname, "index.html"));
  });

  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
};

start();
