export const ConnectionIndicator = {
  props: ["isOnline"],
  template: `
<div id="connection-status" :class="{ online: isOnline }">
  <span></span>
</div>
`,
};
