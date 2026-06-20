function openTestModal() {
  refreshTestSelects();
  AppState.els.testPromptInput.value = AppState.settings.defaultPrompt;
  AppState.els.testResultBox.textContent = "暂无结果";
  openModal(AppState.els.testModal);
}

function runChatTest() {
  var keyValue = AppState.els.testKeySelect.value;
  var model = AppState.els.testModelSelect.value;
  var prompt = AppState.els.testPromptInput.value.trim();
  if (!keyValue) { showToast("请选择 API Key", "error"); return; }

  var parts = keyValue.split("::");
  var channelId = parts[0];
  var keyId = parts[1];
  var ch = AppState.channels.find(function (c) { return c.id === channelId; });
  var key = (ch && ch.keys ? ch.keys : []).find(function (k) { return k.id === keyId; });
  if (!ch || !key) { showToast("API Key 不存在", "error"); return; }

  var testCh = JSON.parse(JSON.stringify(ch));
  testCh.keys = [key];
  testCh.key = key.value;

  AppState.els.testResultBox.textContent = "正在测试...";
  testChannel(testCh, model, prompt).then(function (reply) {
    AppState.els.testResultBox.textContent = reply;
    ch.response_time = testCh.response_time;
    ch.test_time = testCh.test_time;
    saveChannels();
  }).catch(function (err) {
    AppState.els.testResultBox.textContent = "测试失败：\n" + err.message;
  });
}

