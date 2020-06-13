export const ConnectionIndicator = {
  props: ["mode"],
  template: `
<div id="connection-status" :class="mode">
  <span></span>
</div>
`,
};
