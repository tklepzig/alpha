import Vue from "https://cdn.jsdelivr.net/npm/vue@2.6.11/dist/vue.esm.browser.js";
import { createTask } from "./common.js";

const readTasks = () => {
  const raw = localStorage.getItem("alpha-tasks");
  return raw === null ? [] : JSON.parse(raw);
};

const writeTasks = tasks => {
  localStorage.setItem("alpha-tasks", JSON.stringify(tasks));
};

new Vue({
  el: "#app",
  data: {
    tasks: [],
    cachedTitles: [],
    syncDryRunChangedTasks: [],
    syncDryRunNewTasks: [],
    isOnline: false,
    isWaitingForSyncConfirmation: false,
    newTaskText: "",
    mode: "main"
  },
  computed: {
    enrichedTasks() {
      return this.tasks.map((task, i) => {
        const taskNo = i + 1;
        const taskWithTitle = this.cachedTitles.find(
          ({ id }) => id === task.id
        );
        if (taskWithTitle) {
          return {
            ...task,
            taskNo,
            link: task.text,
            text: taskWithTitle.text
          };
        }
        return { ...task, taskNo };
      });
    }
  },
  methods: {
    onOpen() {
      this.syncDryRun().then(({ changedTasks, newTasks }) => {
        if (changedTasks.length === 0 && newTasks.length === 0) {
          this.sync(this.tasks);
          return;
        }

        this.isWaitingForSyncConfirmation = true;
        this.mode = "sync-confirm";
        this.syncDryRunChangedTasks = changedTasks;
        this.syncDryRunNewTasks = newTasks;
      });
    },
    async updateTitleCache(tasks) {
      //TODO: delete not anymore task entries from the title cache
      const newTitles = await Promise.all(
        tasks
          .filter(({ text }) => text.startsWith("http"))
          .filter(task => !this.cachedTitles.find(({ id }) => task.id === id))
          .map(async ({ id, text }) => {
            const res = await fetch(
              `/website-title?url=${encodeURIComponent(text)}`
            );
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
      if (this.isWaitingForSyncConfirmation) {
        return;
      }
      const tasks = JSON.parse(message.data);
      writeTasks(tasks);
      this.tasks = tasks;
      this.updateTitleCache(tasks);
    },
    onClose() {
      this.isOnline = false;
      setTimeout(() => {
        this.connect();
      }, 3000);
    },
    async addTask() {
      const text = this.newTaskText;
      if (!text) return Promise.resolve();
      if (this.isOnline) {
        return fetch("/append", {
          method: "post",
          body: `task=${text}`,
          headers: { "Content-type": "application/x-www-form-urlencoded" }
        }).then(() => {
          this.newTaskText = "";
          window.scrollTo(0, document.body.scrollHeight);
        });
      }

      this.tasks = [...this.tasks, createTask(text)];
      writeTasks(this.tasks);
      this.newTaskText = "";
      window.scrollTo(0, document.body.scrollHeight);
    },
    async toggleDone(taskNo, isDone) {
      if (this.isOnline) {
        return fetch(`/${isDone ? "undone" : "done"}`, {
          method: "post",
          body: `taskNo=${taskNo}`,
          headers: { "Content-type": "application/x-www-form-urlencoded" }
        });
      }

      this.tasks = this.tasks.map((task, i) =>
        i + 1 === parseInt(taskNo) ? { ...task, isDone: !isDone } : task
      );
      writeTasks(this.tasks);
    },
    async move2top(taskNo) {
      if (this.isOnline) {
        return fetch(`/move2top`, {
          method: "post",
          body: `taskNo=${taskNo}`,
          headers: { "Content-type": "application/x-www-form-urlencoded" }
        });
      }

      this.tasks = this.tasks.reduce((result, task, i) => {
        if (i + 1 === parseInt(taskNo)) {
          result.unshift(task);
        } else {
          result.push(task);
        }
        return result;
      }, []);
      writeTasks(this.tasks);
    },
    async sync(tasks) {
      await fetch(`/sync`, {
        method: "POST",
        body: JSON.stringify(tasks),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });
      this.isOnline = true;
    },
    async syncDryRun() {
      const res = await fetch(`/sync-dry-run`, {
        method: "POST",
        body: JSON.stringify(this.tasks),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });
      return await res.json();
    },
    async resetTasks() {
      this.isWaitingForSyncConfirmation = false;
      await this.sync([]);
      this.mode = "main";
    },
    async confirmSync() {
      this.isWaitingForSyncConfirmation = false;
      await this.sync(this.tasks);
      this.mode = "main";
    },
    connect() {
      const ws = new WebSocket(`ws://${window.location.host}`);
      ws.onopen = this.onOpen;
      ws.onmessage = this.onMessage;
      ws.onclose = this.onClose;
    }
  },
  created() {
    const cachedTitlesRaw = localStorage.getItem("alpha-cached-titles");
    this.cachedTitles =
      cachedTitlesRaw !== null ? JSON.parse(cachedTitlesRaw) : [];
    this.tasks = readTasks();
    this.connect();
  }
});
