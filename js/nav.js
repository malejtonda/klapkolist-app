// Screens are functions that render the whole page. The back button walks a stack of them.
let stack = [];
let current = null;

export function navigate(screen, ...args){
  if (current) stack.push(current);
  current = { screen, args };
  screen(...args);
}
export function goBack(){
  if (!stack.length) return;
  current = stack.pop();
  refresh();
}
export function refresh(){ current?.screen(...current.args); }
// Start over from this screen, with nothing to go back to.
export function navReset(screen, ...args){
  stack = []; current = null;
  navigate(screen, ...args);
}
