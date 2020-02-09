const generateGuid = () => {
  var timeinMs = new Date().getTime();
  var uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    var r = (timeinMs + Math.random() * 16) % 16 | 0;
    timeinMs = Math.floor(timeinMs / 16);
    return (char == "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
  return uuid;
};

export const createTask = text => ({
  text,
  isDone: false,
  id: generateGuid(),
  lastModified: new Date().toISOString()
});
