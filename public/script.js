const render = tasks => {
  const sections = tasks.map(
    ({ id, text, isDone }) =>
      `<section class="${isDone ? "done" : ""}" onclick="toggleOpacity(this)">
          <button class="move2top" onclick="move2top(${id}, event)">${id}</button>
          <span>${text}</span>
          <button class="toggle-done" onclick="toggleDone(${id}, ${isDone}, event)" />
        </section>`
  );

  document.getElementById("tasks").innerHTML = sections.join("");
};

document.getElementById("edit").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("new-task");
  addTask(input.value, "append").then(() => {
    input.value = "";
  });
  return false;
});

const addTask = async text => {
  if (!text) return Promise.resolve();
  return fetch("/append", {
    method: "post",
    body: `task=${text}`,
    headers: { "Content-type": "application/x-www-form-urlencoded" }
  }).then(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
};

const move2top = (id, e) => {
  e.stopPropagation();
  fetch(`/move2top`, {
    method: "post",
    body: `taskNo=${id}`,
    headers: { "Content-type": "application/x-www-form-urlencoded" }
  });
};

const toggleDone = (id, isDone, e) => {
  e.stopPropagation();
  fetch(`/${isDone ? "undone" : "done"}`, {
    method: "post",
    body: `taskNo=${id}`,
    headers: { "Content-type": "application/x-www-form-urlencoded" }
  });
};

const toggleOpacity = element => {
  element.classList.toggle("hidden");
};

fetch("/tasks")
  .then(res => res.json())
  .then(tasks => render(tasks));

const ws = new WebSocket(`ws://${window.location.host}`);
ws.onmessage = message => {
  const hiddenTasks = document.querySelectorAll("section.hidden");
  if (hiddenTasks.length === 0) {
    render(JSON.parse(message.data));
  }
};
