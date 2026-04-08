// =====================================================
// НАСТРОЙКИ — замени на свои значения
// =====================================================
const TOKEN = "YOUR_BOT_TOKEN";
const SHEET_ID = "YOUR_SHEET_ID";

// =====================================================
// Telegram Bot webhook handler
// =====================================================
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const chatId = contents.message.chat.id;
    const text = contents.message.text ? contents.message.text.toString().replace(",", ".") : "";

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const logSheet = ss.getSheetByName("Крестики");
    const projectSheet = ss.getSheetByName("Проекты");
    const fullRange = projectSheet.getRange("A2:P50").getValues();

    const today = new Date();
    const todayStr = Utilities.formatDate(today, "GMT+1", "dd.MM.yyyy");

    const activeProjects = fullRange
      .filter(row => {
        let name = row[1] ? row[1].toString().trim() : "";
        let finishDate = row[5];
        let progress = parseFloat(row[10]);
        return name !== "" && finishDate !== "" && (isNaN(progress) || progress < 1);
      })
      .map(row => row[1].toString().trim());

    // --- 📊 ИТОГИ ---
    if (text === "📊 ИТОГИ") {
      let startMonday = new Date(today);
      let day = today.getDay();
      let diff = (day === 0 ? -6 : 1 - day);
      startMonday.setDate(today.getDate() + diff);
      startMonday.setHours(0, 0, 0, 0);
      let endSunday = new Date(startMonday);
      endSunday.setDate(startMonday.getDate() + 6);
      endSunday.setHours(23, 59, 59, 999);

      const logData = logSheet.getRange("A2:C" + logSheet.getLastRow()).getValues();
      let stats = {};
      let totalSum = 0;

      for (let i = 0; i < logData.length; i++) {
        let cellDateRaw = logData[i][0];
        if (!cellDateRaw) continue;
        let entryDate;
        if (cellDateRaw instanceof Date) {
          entryDate = cellDateRaw;
        } else {
          let parts = cellDateRaw.toString().split(".");
          if (parts.length < 3) continue;
          entryDate = new Date(parts[2], parts[1] - 1, parts[0]);
        }
        if (entryDate >= startMonday && entryDate <= endSunday) {
          let proj = logData[i][1].toString().trim();
          let count = parseFloat(logData[i][2]) || 0;
          stats[proj] = (stats[proj] || 0) + count;
          totalSum += count;
        }
      }

      let dateRange = Utilities.formatDate(startMonday, "GMT+1", "dd.MM") + " - " + Utilities.formatDate(endSunday, "GMT+1", "dd.MM");
      let report = "Отчет за неделю (" + dateRange + "):\n\n";
      let hasData = false;
      for (let proj in stats) {
        if (stats[proj] > 0) {
          let finishMark = "";
          for (let j = 0; j < fullRange.length; j++) {
            if (fullRange[j][1].toString().trim() === proj && fullRange[j][10] >= 1) {
              finishMark = " — Финиш! ✅";
              break;
            }
          }
          report += proj + ": " + stats[proj] + " кр." + finishMark + "\n";
          hasData = true;
        }
      }
      sendMessage(chatId, hasData ? report + "\nВсего: " + totalSum + " кр." : "За эту неделю (" + dateRange + ") записей пока нет.");
      return;
    }

    // --- 📅 ПЛАН ---
    if (text === "📅 ПЛАН") {
      let report = "📊 *Осталось по плану:*\n\n";
      let found = false;
      for (let i = 0; i < fullRange.length; i++) {
        let row = fullRange[i];
        let name = row[1] ? row[1].toString().trim() : "";
        let weeklyNorm = parseFloat(row[14]);
        let leftWeek = parseFloat(row[15]);
        let progress = row[10];
        if (name !== "" && !isNaN(weeklyNorm) && weeklyNorm > 0) {
          let status = (progress >= 1) ? "Финиш! ✅" : (leftWeek > 0 ? `*${leftWeek}* кр.` : `✅ *ГОТОВО*`);
          report += `• *${name}*: ${status}\n`;
          found = true;
        }
      }
      sendMessage(chatId, found ? report : "Плана на неделю нет! ✨");
      return;
    }

    // --- 🎡 ФОРТУНА ---
    if (text === "🎡 ФОРТУНА") {
      if (activeProjects.length === 0) {
        sendMessage(chatId, "Нет активных проектов! 🤷‍♀️");
        return;
      }
      const randomProject = activeProjects[Math.floor(Math.random() * activeProjects.length)];
      PropertiesService.getScriptProperties().setProperty('lastProject_' + chatId, randomProject);
      sendMessage(chatId, `🎡 Фортуна выбрала: *${randomProject}*!\n\nСколько сегодня вышьем?`);
      return;
    }

    // --- ЗАПИСЬ КРЕСТИКОВ ---
    if (!isNaN(text) && text !== "" && text !== null) {
      const lastProject = PropertiesService.getScriptProperties().getProperty('lastProject_' + chatId);
      if (!lastProject) {
        sendMessage(chatId, "Сначала выбери проект! 👇");
        sendProjectButtons(chatId, activeProjects);
        return;
      }
      const numValue = Number(text);
      const logData = logSheet.getRange("A:C").getDisplayValues();
      let rowIndex = -1;
      for (let i = 0; i < logData.length; i++) {
        if (logData[i][0] === todayStr && logData[i][1].toLowerCase() === lastProject.toLowerCase()) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex !== -1) logSheet.getRange(rowIndex, 3).setValue(numValue);
      else logSheet.appendRow([todayStr, lastProject, numValue]);

      SpreadsheetApp.flush();
      const updatedData = projectSheet.getRange("B2:P50").getValues();
      let resMsg = "";
      for (let i = 0; i < updatedData.length; i++) {
        if (updatedData[i][0].toString().trim().toLowerCase() === lastProject.toLowerCase()) {
          let rem = parseFloat(updatedData[i][14]) || 0;
          let prog = updatedData[i][9];
          resMsg = (prog >= 1) ? "\n*ФИНИШ! ✅*" : (rem > 0 ? `\nОсталось до нормы: *${rem}* кр.` : `\n🎉 Недельная норма выполнена!`);
          break;
        }
      }
      sendMessage(chatId, `✅ *${lastProject}*: *${numValue}* кр.${resMsg}`);
      return;
    }

    const origText = contents.message.text;
    if (activeProjects.includes(origText)) {
      PropertiesService.getScriptProperties().setProperty('lastProject_' + chatId, origText);
      sendMessage(chatId, `Выбран: *${origText}*.\nЖду крестики!`);
    } else {
      sendProjectButtons(chatId, activeProjects);
    }
  } catch (err) {
    Logger.log("doPost error: " + err);
  }
}

// =====================================================
// Mini App API — обрабатывает запросы от веб-приложения
// =====================================================
function doGet(e) {
  const action = e.parameter.action || '';

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const logSheet = ss.getSheetByName("Крестики");
  const projectSheet = ss.getSheetByName("Проекты");
  const fullRange = projectSheet.getRange("A2:P50").getValues();

  const today = new Date();
  const todayStr = Utilities.formatDate(today, "GMT+1", "dd.MM.yyyy");

  let result;

  // --- GET PROJECTS ---
  if (action === 'getProjects') {
    const logData = logSheet.getRange("A:C").getDisplayValues();

    // Записи за сегодня
    let todayLog = {};
    for (let i = 1; i < logData.length; i++) {
      if (logData[i][0] === todayStr && logData[i][1]) {
        todayLog[logData[i][1].trim()] = parseFloat(logData[i][2]) || 0;
      }
    }

    const projects = fullRange
      .filter(row => {
        let name = row[1] ? row[1].toString().trim() : "";
        let finishDate = row[5];
        let progress = parseFloat(row[10]);
        return name !== "" && finishDate !== "" && (isNaN(progress) || progress < 1);
      })
      .map(row => {
        const name = row[1].toString().trim();
        return {
          name: name,
          progress: parseFloat(row[10]) || 0,
          weeklyNorm: parseFloat(row[14]) || 0,
          leftWeek: parseFloat(row[15]) || 0,
          finishDate: row[5] ? Utilities.formatDate(new Date(row[5]), "GMT+1", "dd.MM.yyyy") : "",
          todayCount: todayLog[name] || 0
        };
      });

    result = { projects: projects, todayStr: todayStr };

  // --- GET WEEKLY STATS ---
  } else if (action === 'getWeeklyStats') {
    let startMonday = new Date(today);
    let day = today.getDay();
    let diff = (day === 0 ? -6 : 1 - day);
    startMonday.setDate(today.getDate() + diff);
    startMonday.setHours(0, 0, 0, 0);
    let endSunday = new Date(startMonday);
    endSunday.setDate(startMonday.getDate() + 6);
    endSunday.setHours(23, 59, 59, 999);

    const lastRow = logSheet.getLastRow();
    if (lastRow < 2) {
      result = { stats: {}, totalSum: 0, dateRange: "" };
    } else {
      const logData = logSheet.getRange("A2:C" + lastRow).getValues();
      let stats = {};
      let totalSum = 0;

      for (let i = 0; i < logData.length; i++) {
        let cellDateRaw = logData[i][0];
        if (!cellDateRaw) continue;
        let entryDate;
        if (cellDateRaw instanceof Date) {
          entryDate = cellDateRaw;
        } else {
          let parts = cellDateRaw.toString().split(".");
          if (parts.length < 3) continue;
          entryDate = new Date(parts[2], parts[1] - 1, parts[0]);
        }
        if (entryDate >= startMonday && entryDate <= endSunday) {
          let proj = logData[i][1].toString().trim();
          let count = parseFloat(logData[i][2]) || 0;
          if (proj) {
            stats[proj] = (stats[proj] || 0) + count;
            totalSum += count;
          }
        }
      }

      // Добавляем норму из таблицы проектов
      let statsWithNorm = {};
      for (let proj in stats) {
        let norm = 0;
        for (let i = 0; i < fullRange.length; i++) {
          if (fullRange[i][1] && fullRange[i][1].toString().trim() === proj) {
            norm = parseFloat(fullRange[i][14]) || 0;
            break;
          }
        }
        statsWithNorm[proj] = { done: stats[proj], norm: norm };
      }

      let dateRange = Utilities.formatDate(startMonday, "GMT+1", "dd.MM") + " – " + Utilities.formatDate(endSunday, "GMT+1", "dd.MM");
      result = { stats: statsWithNorm, totalSum: totalSum, dateRange: dateRange };
    }

  // --- LOG STITCHES ---
  } else if (action === 'logStitches') {
    const project = e.parameter.project || '';
    const count = parseFloat((e.parameter.count || '0').replace(',', '.'));

    if (!project || isNaN(count) || count < 0) {
      result = { error: 'Неверные параметры' };
    } else {
      const logData = logSheet.getRange("A:C").getDisplayValues();
      let rowIndex = -1;
      for (let i = 0; i < logData.length; i++) {
        if (logData[i][0] === todayStr && logData[i][1].toLowerCase() === project.toLowerCase()) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex !== -1) {
        logSheet.getRange(rowIndex, 3).setValue(count);
      } else {
        logSheet.appendRow([todayStr, project, count]);
      }
      SpreadsheetApp.flush();

      // Возвращаем обновлённые данные проекта
      const updatedData = projectSheet.getRange("B2:P50").getValues();
      let leftWeek = 0, progress = 0;
      for (let i = 0; i < updatedData.length; i++) {
        if (updatedData[i][0].toString().trim().toLowerCase() === project.toLowerCase()) {
          leftWeek = parseFloat(updatedData[i][14]) || 0;
          progress = parseFloat(updatedData[i][9]) || 0;
          break;
        }
      }
      result = { success: true, leftWeek: leftWeek, progress: progress, count: count };
    }

  } else {
    result = { error: 'Неизвестный action' };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================
// Вспомогательные функции
// =====================================================
function sendProjectButtons(chatId, projects) {
  // Кнопка открытия Mini App
  const miniAppUrl = "https://kholyness.github.io/CrossStitch/";

  const keyboard = [
    [{ text: "🧵 Открыть приложение", web_app: { url: miniAppUrl } }],
    [{ text: "📅 ПЛАН" }, { text: "📊 ИТОГИ" }, { text: "🎡 ФОРТУНА" }]
  ];
  for (let i = 0; i < projects.length; i += 2) {
    const row = [{ text: projects[i] }];
    if (projects[i + 1]) row.push({ text: projects[i + 1] });
    keyboard.push(row);
  }
  callApi({
    method: "sendMessage",
    chat_id: String(chatId),
    text: "Что вышиваем сегодня? 👇",
    parse_mode: "Markdown",
    reply_markup: JSON.stringify({ keyboard: keyboard, resize_keyboard: true })
  });
}

function sendMessage(chatId, text) {
  callApi({ method: "sendMessage", chat_id: String(chatId), text: text, parse_mode: "Markdown" });
}

function callApi(payload) {
  UrlFetchApp.fetch("https://api.telegram.org/bot" + TOKEN + "/" + payload.method, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload)
  });
}
