import React from "https://dev.jspm.io/react"
import ReactDOM from "https://dev.jspm.io/react-dom"

const View = () => {
  const [now, setNow] = React.useState(new Date());
  return (
    <div>
      now: {now.toISOString()}
      <button onClick={() => setNow(new Date())}>update</button>
    </div>
  )
};

window.addEventListener("DOMContentLoaded", () => {
  ReactDOM.render(<View />, document.body);
});
