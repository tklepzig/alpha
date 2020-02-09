import { createTask } from "./common.js";

const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
let isOnline = false;

const renderSyncDryRunResult = tasks => {
  const sections = tasks.map(
    ({ text, isDone }) =>
      `<section class="${isDone ? "done" : ""}">
          <span>${text}</span>
        </section>`
  );

  document.querySelector("#sync-confirm > article").innerHTML = sections.join(
    ""
  );
};

const render = tasks => {
  const sections = tasks.map(
    ({ taskNo, text, isDone }) =>
      `<section class="${isDone ? "done" : ""}" onclick="toggleOpacity(this)">
          <button class="move2top" onclick="move2top(${taskNo}, event)">${taskNo}</button>
          <span>${text}</span>
          <button class="toggle-done" onclick="toggleDone(${taskNo}, ${isDone}, event)" />
        </section>`
  );

  document.getElementById("tasks").innerHTML = sections.join("");
};

document.getElementById("edit").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("new-task");
  addTask(input.value).then(() => {
    input.value = "";
  });
  return false;
});

const readTasks = () => {
  const raw = localStorage.getItem("alpha-tasks");
  return raw === null ? [] : JSON.parse(raw);
};
const renderTasks = () => {
  render(readTasks().map((task, i) => ({ ...task, taskNo: i + 1 })));
};

const writeTasks = tasks => {
  localStorage.setItem("alpha-tasks", JSON.stringify(tasks));
};

const addTask = async text => {
  if (!text) return Promise.resolve();
  if (isOnline) {
    return fetch("/append", {
      method: "post",
      body: `task=${text}`,
      headers: { "Content-type": "application/x-www-form-urlencoded" }
    }).then(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
  }

  writeTasks([...readTasks(), createTask(text)]);
  window.scrollTo(0, document.body.scrollHeight);
  renderTasks();
};

const move2top = async (taskNo, e) => {
  e.stopPropagation();
  if (isOnline) {
    return fetch(`/move2top`, {
      method: "post",
      body: `taskNo=${taskNo}`,
      headers: { "Content-type": "application/x-www-form-urlencoded" }
    });
  }

  writeTasks(
    readTasks().reduce((result, task, i) => {
      if (i + 1 === parseInt(taskNo)) {
        result.unshift(task);
      } else {
        result.push(task);
      }
      return result;
    }, [])
  );
  renderTasks();
};
window.move2top = move2top;

const toggleDone = async (taskNo, isDone, e) => {
  e.stopPropagation();

  if (isOnline) {
    return fetch(`/${isDone ? "undone" : "done"}`, {
      method: "post",
      body: `taskNo=${taskNo}`,
      headers: { "Content-type": "application/x-www-form-urlencoded" }
    });
  }

  writeTasks(
    readTasks().map((task, i) =>
      i + 1 === parseInt(taskNo) ? { ...task, isDone: !isDone } : task
    )
  );
  renderTasks();
};
window.toggleDone = toggleDone;

const toggleOpacity = element => {
  element.classList.toggle("hidden");
};
window.toggleOpacity = toggleOpacity;

const sync = tasks =>
  fetch(`/sync`, {
    method: "POST",
    body: JSON.stringify(tasks),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    }
  }).then(() => {
    document.getElementById("connection-status").classList.add("online");
    document.getElementById("connection-status").classList.remove("offline");
    isOnline = true;
  });

const syncDryRun = () =>
  fetch(`/sync-dry-run`, {
    method: "POST",
    body: JSON.stringify(readTasks()),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    }
  }).then(res => res.json());

const resetTasks = () => {
  sync([]).then(() => {
    document.getElementById("main").classList.remove("hidden");
    document.getElementById("sync-confirm").classList.add("hidden");
  });
};
window.resetTasks = resetTasks;

const confirmSync = () => {
  sync(readTasks()).then(() => {
    document.getElementById("main").classList.remove("hidden");
    document.getElementById("sync-confirm").classList.add("hidden");
  });
};
window.confirmSync = confirmSync;

const connect = () => {
  const ws = new WebSocket(`ws://${window.location.host}`);
  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = onClose;
};

const onOpen = () => {
  const now = new Date().toISOString();
  const lastSync = localStorage.getItem("alpha-last-sync") || now;
  if (new Date(now).getTime() - new Date(lastSync).getTime() <= threeDaysInMs) {
    sync(readTasks());
    return;
  }

  syncDryRun().then(tasks => {
    if (tasks.length === 0) {
      sync(readTasks());
      return;
    }

    document.getElementById("main").classList.add("hidden");
    document.getElementById("sync-confirm").classList.remove("hidden");
    renderSyncDryRunResult(tasks);
  });
};

const onMessage = ({ data: tasks }) => {
  writeTasks(JSON.parse(tasks));
  localStorage.setItem("alpha-last-sync", new Date().toISOString());
  const hiddenTasks = document.querySelectorAll("section.hidden");
  if (hiddenTasks.length === 0) {
    renderTasks();
  }
};
const onClose = () => {
  document.getElementById("connection-status").classList.remove("online");
  document.getElementById("connection-status").classList.add("offline");
  isOnline = false;
  setTimeout(() => {
    connect();
  }, 3000);
};

renderTasks();
connect();
