let loadTimer;

const load = () =>
  fetch("/tasks")
    .then(res => res.json())
    .then(tasks => {
      const sections = tasks.map(
        ({ id, text, isDone }) =>
        `<section class="${
                  isDone ? "done" : ""
                }" onclick="toggleOpacity(this)">
                    <span>${id}</span>
                    <span>${text}</span>
                    <button onclick="toggleDone(${id}, ${isDone}, event)" />
                    </section>`
      );

      document.getElementById("tasks").innerHTML = sections.join("");
    });

document.getElementById("edit").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("new-task");
  addTask(input.value, "append")
    .then(() => {
      input.value = "";
    });
  return false;
});

const addTask = text => {
  if (!text) return Promise.resolve();
  return fetch("/append", {
    method: "post",
    body: `task=${text}`,
    headers: { "Content-type": "application/x-www-form-urlencoded" }
  })
    .then(() => load())
    .then(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
};

const toggleDone = (id, isDone, e) => {
  e.stopPropagation();
  fetch(`/${isDone ? "undone" : "done"}`, {
    method: "post",
    body: `taskNo=${id}`,
    headers: { "Content-type": "application/x-www-form-urlencoded" }
  }).then(() => load());
};

const toggleOpacity = element => {
  element.classList.toggle("hidden");
  const hiddenTasks = document.querySelectorAll("section.hidden");
  if (hiddenTasks.length > 0) {
    // stop auto refresh since it would reset the changed opacity
    clearInterval(loadTimer);
  } else {
    loadTimer = setInterval(load, 15000);
  }
};

load();
loadTimer = setInterval(load, 15000);

