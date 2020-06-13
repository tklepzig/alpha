import Vue from "https://cdn.jsdelivr.net/npm/vue@2.6.11/dist/vue.esm.browser.js";
import { ConnectionIndicator } from "./components/ConnectionIndicator.js";
import { createTask } from "./common.js";

const readLists = () => {
  const raw = localStorage.getItem("alpha-tasks");
  return raw === null ? [] : JSON.parse(raw);
};

const writeLists = (lists) => {
  localStorage.setItem("alpha-tasks", JSON.stringify(lists));
};

const vibrate = (duration) => {
  const navigator = window.navigator;

  navigator.vibrate =
    navigator.vibrate ||
    navigator.webkitVibrate ||
    navigator.mozVibrate ||
    navigator.msVibrate;

  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
};

new Vue({
  el: "#app",
  components: {
    connectionIndicator: ConnectionIndicator,
  },
  data: {
    listNo: 1,
    lists: [],
    cachedTitles: [],
    connectionMode: "offline",
    newTaskText: "",
    mode: "main",
  },
  computed: {
    enrichedTasks() {
      if (this.lists.length === 0) {
        return [];
      }

      return this.lists[this.listNo - 1].tasks.map((task, i) => {
        const taskNo = i + 1;
        const taskWithTitle = this.cachedTitles.find(
          ({ id }) => id === task.id
        );
        if (taskWithTitle) {
          return {
            ...task,
            taskNo,
            link: task.text,
            text: taskWithTitle.text,
          };
        }
        return { ...task, taskNo };
      });
    },
    listName() {
      if (this.lists.length < this.listNo) {
        return "";
      }
      return this.lists[this.listNo - 1].name;
    },
  },
  methods: {
    getCurrentListTasks() {
      return this.lists[this.listNo - 1].tasks;
    },
    updateCurrentListTasks(tasks) {
      this.lists[this.listNo - 1].tasks = tasks;
    },
    setMode(mode) {
      vibrate(20);
      this.mode = mode;
    },
    switchList(index) {
      this.listNo = index + 1;
      this.setMode("main");
    },
    isUrl(text) {
      return text.startsWith("http");
    },
    async onOpen() {
      const result = await this.syncDryRun();
      if (result.result.length === 0) {
        this.sync();
        return;
      }
      console.dir(result);
      this.connectionMode = "sync";
      this.mode = "sync-confirm";
    },
    async updateTitleCache(lists) {
      //TODO: delete not anymore task entries from the title cache
      const allTasksFlat = lists.reduce(
        (tasks, list) => [...tasks, ...list.tasks],
        []
      );
      const newTitles = await Promise.all(
        allTasksFlat
          .filter(({ text }) => this.isUrl(text))
          .filter((task) => !this.cachedTitles.find(({ id }) => task.id === id))
          .map(async ({ id, text }) => {
            const res = await fetch(
              `/website-title?url=${encodeURIComponent(text)}`
            );
            if (res.status !== 200) {
              return { id, text };
            }
            const title = await res.text();
            return { id, text: title };
          })
      );

      if (newTitles.length > 0) {
        const updatedCache = [...this.cachedTitles, ...newTitles];
        localStorage.setItem(
          "alpha-cached-titles",
          JSON.stringify(updatedCache)
        );
        this.cachedTitles = updatedCache;
      }
    },
    async onMessage(message) {
      if (this.connectionMode === "sync") {
        return;
      }
      const lists = JSON.parse(message.data);
      writeLists(lists);
      this.lists = lists;
      this.updateTitleCache(lists);
    },
    onClose() {
      this.connectionMode = "offline";
      setTimeout(() => {
        this.connect();
      }, 3000);
    },
    cloneTask(text) {
      const matches = text.match(/(.*)\/(\d+)/i);
      if (this.isUrl(text) || !matches || matches.length !== 3) {
        return undefined;
      }
      const listName = matches[1];
      const taskNo = matches[2];

      const listIndex = listName
        ? this.lists.findIndex((l) => l.name === listName)
        : 0;

      if (taskNo > this.lists[listIndex].tasks.length) {
        return undefined;
      }

      const task = this.lists[listIndex].tasks[taskNo - 1];
      return task.text;
    },
    async addTask() {
      let text = this.newTaskText;
      const existingTaskText = this.cloneTask(text);
      if (existingTaskText) {
        text = existingTaskText;
      }
      if (!text) return Promise.resolve();
      if (this.connectionMode === "online") {
        return fetch("/append", {
          method: "post",
          body: `task=${text}&listNo=${this.listNo}`,
          headers: { "Content-type": "application/x-www-form-urlencoded" },
        }).then(() => {
          this.newTaskText = "";
          window.scrollTo(0, document.body.scrollHeight);
        });
      }

      this.updateCurrentListTasks([
        ...this.getCurrentListTasks(),
        createTask(text),
      ]);
      writeLists(this.lists);
      this.newTaskText = "";
      window.scrollTo(0, document.body.scrollHeight);
    },
    async toggleDone(taskNo, isDone) {
      vibrate(40);
      if (this.connectionMode === "online") {
        return fetch(`/${isDone ? "undone" : "done"}`, {
          method: "post",
          body: `taskNo=${taskNo}&listNo=${this.listNo}`,
          headers: { "Content-type": "application/x-www-form-urlencoded" },
        });
      }

      this.updateCurrentListTasks(
        this.getCurrentListTasks().map((task, i) =>
          i + 1 === parseInt(taskNo) ? { ...task, isDone: !isDone } : task
        )
      );
      writeLists(this.lists);
    },
    async move2top(taskNo) {
      vibrate(40);
      if (this.connectionMode === "online") {
        return fetch(`/move2top`, {
          method: "post",
          body: `taskNo=${taskNo}&listNo=${this.listNo}`,
          headers: { "Content-type": "application/x-www-form-urlencoded" },
        });
      }

      this.updateCurrentListTasks(
        this.getCurrentListTasks().reduce((result, task, i) => {
          if (i + 1 === parseInt(taskNo)) {
            result.unshift(task);
          } else {
            result.push(task);
          }
          return result;
        }, [])
      );
      writeLists(this.lists);
    },
    async sync() {
      //await fetch(`/sync`, {
      //method: "POST",
      //body: JSON.stringify(tasks),
      //headers: {
      //Accept: "application/json",
      //"Content-Type": "application/json",
      //},
      //});
      this.connectionMode = "online";
      this.mode = "main";
    },
    async syncDryRun() {
      const res = await fetch(`/sync-dry-run`, {
        method: "POST",
        body: JSON.stringify(this.lists),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      return await res.json();
    },
    async resetTasks() {
      const res = await fetch(`/lists`);
      this.lists = await res.json();
      this.updateTitleCache(this.lists);
      writeLists(this.lists);
      await this.sync();
    },
    //async confirmSync() {
    //await this.sync(this.tasks);
    //},
    connect() {
      const webSocketProtocol = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(
        `${webSocketProtocol}://${window.location.host}`
      );
      ws.onopen = this.onOpen;
      ws.onmessage = this.onMessage;
      ws.onclose = this.onClose;
    },
  },
  created() {
    const cachedTitlesRaw = localStorage.getItem("alpha-cached-titles");
    this.cachedTitles =
      cachedTitlesRaw !== null ? JSON.parse(cachedTitlesRaw) : [];
    this.lists = readLists();
    this.connect();
  },
});
