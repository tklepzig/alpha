describe("Name of the group", () => {
  it("should work", () => {
    const clientTasks = [
      { text: "Task B", isDone: false, id: "b" },
      { text: "Task A", isDone: false, id: "a" },
      { text: "Task C", isDone: true, id: "c" },
      { text: "Task D", isDone: false, id: "d" }
    ];
    const serverTasks = [
      { text: "Task A", isDone: false, id: "a" },
      { text: "Task B", isDone: false, id: "b" },
      { text: "Task C", isDone: false, id: "c" }
    ];

    const expected = [
      {
        client: {
          task: { text: "Task B", isDone: false, id: "b" },
          type: "add"
        },
        server: { type: "delete" }
      }
    ];
  });
});
