/* CPU Grok Bot thinks here so the UI stays smooth */
importScripts('logic.js');
self.onmessage = (e) => {
  const { id, board, pairs, level, ctx, seed } = e.data;
  const m = GBLogic.chooseMove(new Uint8Array(board), pairs, level, ctx, GBLogic.rng(seed));
  self.postMessage({ id, m });
};
