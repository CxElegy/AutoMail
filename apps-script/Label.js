// 段階2：Routine が読まなくてよいメール（広告）に Gmail ラベルを付ける。
// Routine 側は Gmail 検索に「-label:automail-skip」を付けて、このラベルのスレッドを読まない。
// ラベルはスレッド単位なので、メッセージが1通だけのスレッドにだけ付ける
// （自分宛メモへの返信などが同じスレッドに来たときに、Routine から隠れてしまわないように）。

const SKIP_LABEL = 'automail-skip';
const SKIP_CATEGORIES = ['広告'];

function skipLabel_() {
  return GmailApp.getUserLabelByName(SKIP_LABEL) || GmailApp.createLabel(SKIP_LABEL);
}

// rows と batch は同じ順番。ラベルを付けたスレッド数を返す。
function labelSkippable_(batch, rows) {
  const threads = [];
  rows.forEach((row, i) => {
    if (SKIP_CATEGORIES.indexOf(row.category) < 0) return;
    const th = batch[i].getThread();
    if (th.getMessageCount() !== 1) return;
    threads.push(th);
    row.skip_label = true;
  });
  if (!threads.length) return 0;
  const label = skipLabel_();
  for (let i = 0; i < threads.length; i += 100) label.addToThreads(threads.slice(i, i + 100));
  return threads.length;
}
