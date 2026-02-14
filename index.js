import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";

var GROQ_API_KEY = "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";
var __theDirName = path.dirname(fileURLToPath(import.meta.url));
var __theProcessedIdFileName = "processed_message_ids.json";
var theProcessedIdArray = await doReadJson(__theProcessedIdFileName, []);
var JAVASCRIPT_THEME = 'javascript';
var OTHER_THEME = 'other';

async function doReadJson(theFileName = "result.json", fallbackData = []) {
  var theFilePath = path.join(__theDirName, theFileName);
  var theResult = fallbackData;
  var theHandle;
  try {
    theHandle = await fs.promises.open(theFilePath, "r+");
    var theRawData = await theHandle.readFile({ encoding: "utf-8" });
    theResult = JSON.parse(theRawData);
  } catch(e) {
    console.error(`Ошибка чтения файла ${theFilePath}`);
  } finally {
    theHandle.close();
  }

  return theResult;
}

async function doSaveJson(theJson, theFileName = "result.json") {
  var theFilePath = path.join(__theDirName, theFileName);
  await fs.promises.writeFile(
    theFilePath,
    JSON.stringify(theJson, null, 2),
    "utf-8",
  );
}

function doFormatDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date)) {
    throw new Error('Invalid date');
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
}

async function doGenerateChatHtml(theMessages = [], title) {

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var theRows = theMessages
    .filter((m) => m && typeof m === "object" && "text" in m)
    .map((m) => {
      var text = m?.text ?? "";
      var from = m.from ?? "Demi Murych";
      var date = m.date ? doFormatDate(m.date) : "";
      return { id: m.id, text: escapeHtml(text), from: escapeHtml(from), date: escapeHtml(date) };
    });

  var theHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #e7e5de; min-height: 100vh; color: #fff; }
    .chat { max-width: 520px; margin: 0 auto; min-height: 100vh; display: flex; flex-direction: column; }
    .chat-messages { flex: 1; padding: 16px 12px 24px; }
    .msg { margin-bottom: 12px; display: flex; flex-direction: column; align-items: flex-start; }
    .msg-bubble { max-width: 85%; padding: 8px 12px; border-radius: 12px 12px 12px 4px; background: #FFF; color: #3D3D3D; font-size: 15px; line-height: 1.45; word-break: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
    .msg-meta { font-size: 14px; color: #000; font-weight: bold; margin-bottom: 3px; }
    .msg-meta .time { color: #bbbbbb; font-size: 10px; font-weight: 500; float: right; }
  </style>
</head>
<body>
  <div class="chat">
    <div class="chat-messages">
${theRows
  .map(
    (r) =>
      `      <div class="msg"><div class="msg-bubble"><div class="msg-meta">${r.from || "—"}${r.date ? ' <span class="time">ID ' + r.id + ", " + r.date + "</span>" : ""}</div><div>${r.text || ""}</div></div></div>`,
  )
  .join("\n")}
    </div>
  </div>
</body>
</html>`;

  var theFilePath = path.join(__theDirName, "index.html");
  await fs.promises.writeFile(theFilePath, theHtml, "utf-8");
}

async function doAskGroq(theStrings) {
  if (!theStrings?.length) {
    return [];
  }

  var theClient = new Groq({ apiKey: GROQ_API_KEY });
  var theNumbered = theStrings
    .map((s, i) => `${i + 1}. ${s.replace(/[\r\n]+/g, "")}`)
    .join("\n");

  var thePrompt = `You are a text classifier. For each string below, determine whether it is related to programming or JavaScript, or JavaScript specification (code, code discussion, syntax, libraries, frameworks, programmistic words, etc.).

Strings:
${theNumbered}

Reply ONLY with a JSON array of true/false in the same order. Example: [true, false, true]`;

  var theCompletion = await theClient.chat.completions.create({
    messages: [{ role: "user", content: thePrompt }],
    model: "llama-3.1-8b-instant",
  });

  var theContent = theCompletion.choices[0]?.message?.content?.trim() ?? "";
  var theJsonMatch = theContent.match(/\[[\s\S]*\]/);
  var theJsonStr = theJsonMatch ? theJsonMatch[0] : theContent;
  var theResult;

  try {
    theResult = JSON.parse(theJsonStr);
    if (!Array.isArray(theResult)){
      theResult = `Groq return not array`;
    }
    var theBools = theResult.map((v) => Boolean(v));
    theResult = Array.from(
      { length: theStrings.length },
      (_, i) => theBools[i] ?? false,
    );
  } catch(e) {
    theResult = `Ошибка запроса в Groq: ${JSON.stringify(e)}`;
  }

  return theResult;
}

function doCheckMurychMessage(theMsg, withInclude = true) {
  return (
    theMsg?.type === "message" &&
    (withInclude ? !theProcessedIdArray.includes(theMsg.id) : true) &&
    theMsg?.from_id === "user388897792" &&
    theMsg?.text?.length > 100
  );
}

async function doCollectJson(theJson = {}) {
  var theMessages = theJson?.messages || [];
  var theMurychMessages = theMessages.filter(doCheckMurychMessage);
  if(theMurychMessages.length === 0){
    console.warn("Все сообщения обработаны");
    return;
  }
  var theMessagesIndexMap = theMessages.reduce((theObject, theMsg, index) => {
    var theMsgId = theMsg?.id;

    if (!theMsgId) {
      return theObject;
    }
    theObject[theMsgId] = index;
    return theObject;
  }, {});

  var theTens = theMurychMessages.slice(0, 10);
  var theTensTexts = theTens.map((theMsg) => theMsg?.text).filter(Boolean);
  const theRecognizedResult = await doAskGroq(theTensTexts);
  if(!Array.isArray(theRecognizedResult)){
    console.error(`Groq error: ${theRecognizedResult}`);
    return;
  }
  if(theRecognizedResult.length !== theTensTexts.length){
    console.error(`Groq return too long array: ${JSON.stringify(theTensTexts)}`);
    return;
  }

  theTens.forEach((theMsg, index) => {
    var theIsJs = theRecognizedResult[index];
    var theMsgId = theMsg.id;
    var theGlobalMessagesIndex = theMessagesIndexMap[theMsgId];
    theMsg.theme = theIsJs ? JAVASCRIPT_THEME : OTHER_THEME;
    theMessages[theGlobalMessagesIndex] = theMsg;
  });
  theProcessedIdArray.push(...theTens.map(the => the.id));

  //Saving processed message ids
  doSaveJson(theProcessedIdArray, __theProcessedIdFileName);
  theJson.messages = theMessages;
  console.log(`-- Processed ${theProcessedIdArray.length + 10} out of ${theMurychMessages.length}`);
  return theJson;
}

async function doMain() {
  var theJson = await doReadJson();
  var theRecognizedJson;
  do {
    console.log("Start processed next batch");
    theRecognizedJson = await doCollectJson(theJson);
    if(!theRecognizedJson){
      break;
    }

    var sleepSecDuration = 20;
    console.log(`-- Sleep before next batch ${sleepSecDuration} sec`);
    await doSaveJson(theRecognizedJson);
    await new Promise(resolve => setTimeout(resolve, (sleepSecDuration*1000)));
  } while(theRecognizedJson);

  //Generate static html
  theJson = await doReadJson();
  var theMessages = theJson?.messages || [];
  var theJsMessages = theMessages
    .filter(m => doCheckMurychMessage(m, false))
    .filter(m => m?.theme === JAVASCRIPT_THEME);
  await doSaveJson(theJsMessages, "only_murych_js_messages.json");
  await doGenerateChatHtml(theJsMessages, theJson.name);
}

doMain();
