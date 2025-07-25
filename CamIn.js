let autoCaptureInterval = null;
let ingredients = [];
let validingredients =[];
// 打开摄像头
navigator.mediaDevices.getUserMedia({ video: true })
  .then((stream) => {
    const video = document.getElementById("video");
    video.srcObject = stream;
  })
  .catch((err) => {
    alert("Can't Open the Camera：" + err.message);
  });

// 拍照函数
async function takePhoto() {
  const canvas = document.getElementById("canvas");
  const video = document.getElementById("video");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataURL = canvas.toDataURL("image/png");
  const base64Image = dataURL.split(",")[1];

  await sendimgToGPT(base64Image);
  resultDiv.innerHTML = "";
}

document.getElementById("imageUpload").addEventListener("change", handleUploadImage);

function handleUploadImage(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const dataURL = e.target.result;
    const base64Image = dataURL.split(",")[1];

    await sendimgToGPT(base64Image);  // 复用已有函数
    resultDiv.innerHTML = "";
  };
  reader.readAsDataURL(file);
}


// 自动拍照控制
function startAutoCapture() {
  if (autoCaptureInterval) clearInterval(autoCaptureInterval);
  autoCaptureInterval = setInterval(() => takePhoto(), 2000);
}
function stopAutoCapture() {
  if (autoCaptureInterval) clearInterval(autoCaptureInterval);
  autoCaptureInterval = null;
}

// 本地储存
async function saveResultLocally(reply) {
  try {
    const res = await fetch("http://localhost:3000/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: reply })
    });
    const data = await res.json();
    if (data.success) console.log("✅ 已保存为:", data.filename);
    else console.error("❌ 保存失败");
  } catch (err) {
    console.error("❌ 本地储存失败:", err.message);
  }
}

// 图像分析
async function sendimgToGPT(base64Image) {
  const resultDiv = document.getElementById("result");
  // resultDiv.innerHTML = "⏳ Loading...";

  const prompt = `请分析这张照片中有几个食材，，严格以英文输出，绝对不可以出现华文或其他非英文的语言输出严格合法 JSON：
{
  "food1": "...",
  "food2": "...",
  ...
}
不要有解释说明或 markdown 语法。`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer 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" // 请替换成你自己的 key
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`
              }
            }
          ]
        }]
      })
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "❌ 没有回应";

    // resultDiv.innerHTML = `<b>GPT 回应：</b><br><pre>${reply}</pre>`;
    await saveResultLocally(reply);

    // 尝试提取 JSON 并更新 ingredients
    const match = reply.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;

    if (parsed) {
      Object.keys(parsed).forEach((key) => {
        if (key.startsWith("food") && !key.endsWith("ex")) {
          ingredients.push(parsed[key]);
        }
      });
      console.log("✅ 累积食材：", ingredients);
      await sendAllToGPT(); // 自动调用分析
    }

  } catch (err) {
    resultDiv.innerHTML = `❌ 错误：${err.message}`;
  }
  if (resultDiv.innerHTML === "⏳ Loading...") {
    resultDiv.innerHTML = "";
  }
}

// 营养分析
async function sendAllToGPT() {
  const promptPrefix = `
You are a nutritionist AI.

Your task is to determine whether the given input is a real, safe, edible food. Only respond in **pure JSON** format as specified. Never add any explanation.

If the input is a valid, healthy, and edible food (not a drug, object, metal, vehicle, or tool), return this JSON format:

{
  "expected_mass": "in grams, e.g., 1 slice: 50g or 1 can: 300g",
  "protein": "e.g., 5.2g",
  "Carbohydrates": "e.g., 20.1g",
  "Fat": "e.g., 2.0g",
  "Calories": "e.g., 110cal",
  "Dietary_Fiber": "e.g., 1.5g",
  "Sugar": "e.g., 3.0g",
  "vitamin": "e.g., Vitamin C: 12mg, Vitamin A: 200µg",
  "Summary": "Describe the main nutrients, explain which nutrients are dominant and why",
  "Foodcheck": true
}

If it is **not a real food**, return this JSON:

{
"expected_mass": "...",
  "protein": "...",
  "Carbohydrates": "...",
  "Fat": "...",
  "Calories": "...",
  "Dietary_Fiber": "...",
  "Sugar": "...",
  "vitamin": "...",
  "Summary": "...",
  "Foodcheck": false
}

Use English only. Assume the input is spelled correctly and never guess what the item might be.
Only return JSON. No explanation or text outside the JSON.
`;


  const results = document.getElementById("resultsContainer");
  results.innerHTML = "";


for (const value of ingredients) {
    const fullPrompt = `${promptPrefix}\n食材：${value}`;
    const resultDiv = document.createElement("div");
    resultDiv.innerHTML = `<b>${value}</b><br>⏳ Loading...`;
    resultDiv.style = "margin: 10px 0; padding: 10px; border: 1px solid #ccc;";
    results.appendChild(resultDiv);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer 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"
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: fullPrompt }]
        })
      });

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "";

      let parsed;
      try {
        const match = reply.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
      } catch {
        parsed = null;
      }

      if (parsed) {
        if (String(parsed.Foodcheck) === "false") {
          resultDiv.innerHTML = `<b>${value}</b><br><ul><li>IT IS NOT A FOOD AND DON'T EAT IT</li></ul>`;
        } else {
          validingredients.push(value);
        }
        const chartId = `chart-${value.replace(/\s+/g, "-").toLowerCase()}`;

        // 插入 HTML
        resultDiv.innerHTML = `
        <div class="result_block">
          <b>${value} ${parsed.expected_mass}</b><br>
          <ul>
            <li><b>Protein：</b> ${parsed.protein}</li>
            <li><b>Carbohydrates：</b> ${parsed.Carbohydrates}</li>
            <li><b>Fat：</b> ${parsed.Fat}</li>
            <li><b>Calories：</b> ${parsed.Calories}</li>
            <li><b>Dietary Fiber：</b> ${parsed.Dietary_Fiber}</li>
            <li><b>Sugar：</b> ${parsed.Sugar}</li>
            <li><b>Vitamin：</b> ${parsed.vitamin}</li>
            <li><b>Summary：</b> ${parsed.Summary}</li>
          </ul>
          <canvas id="${chartId}" width="300" height="300"></canvas>
          </div>
        `;

        // 提取纯数字
        const getValue = (s) => {
          const match = s.match(/[\d.]+/);
          return match ? parseFloat(match[0]) : 0;
        };

        // 获取原始克数
        const rawValues = [
          getValue(parsed.protein),
          getValue(parsed.Carbohydrates),
          getValue(parsed.Fat),
          getValue(parsed.Dietary_Fiber),
          getValue(parsed.Sugar)
        ];

        // 总和用于计算百分比
        const total = rawValues.reduce((sum, val) => sum + val, 0);

        // 百分比值数组（最多保留1位小数）
        const percentageValues = rawValues.map(v => +(v / total * 100).toFixed(1));

        const labels = ["Protein", "Carbohydrates", "Fat", "Dietary Fiber", "Sugar"];

        setTimeout(() => {
          const ctx = document.getElementById(chartId).getContext("2d");
          new Chart(ctx, {
            type: "pie",
            data: {
              labels: labels,
              datasets: [{
                data: percentageValues,
                backgroundColor: [
                  "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"
                ]
              }]
            },
            options: {
              responsive: false,
              plugins: {
                legend: {
                  position: 'bottom'
                },
                tooltip: {
                  callbacks: {
                    label: function (context) {
                      const label = context.label || '';
                      const value = context.raw || 0;
                      return `${label}: ${value}%`;
                    }
                  }
                }
              }
            }
          });
        }, 100);


        }
       else {
        resultDiv.innerHTML = `<b>「${value}」：</b><br>❌ 无法解析 JSON：<pre>${reply}</pre>`;
      }
    } catch (err) {
      resultDiv.innerHTML = `<b>「${value}」出错：</b><br>${err.message}`;
    }
  }

  // Second GPT call for recipe suggestion
  if (validingredients.length > 0) {
    const recipePrompt = `以下是一些食材：${validingredients.join("、")}

请推荐两道健康菜肴：

第一道菜：只能使用以下食材，不可使用其他任何食材（除了水、盐、胡椒、油、酱油、常见香料这些基本调味料）。

第二道菜：必须包含上述食材，但可以添加其他食材。你必须列出**原有的食材及额外添加的食材和各自的推荐用量**（例如：“鸡蛋：2个，鸡胸肉：100g”），方便用户购买。除了列出的额外食材，不能假设其他蔬菜或食材存在。

所有菜肴必须健康，营养均衡，包含蛋白质、碳水化合物与脂肪。请不要使用任何英文缩写。

请严格用以下 JSON 格式返回，且只能返回 JSON，不要包含任何额外说明。你必须用英文回答：

{
  "strict_dish": {
    "dish": "第一道只能使用提供食材的菜名",
    "recipe": "详细步骤，建议写成流程表，要用编号，换行请用<br>",
    "description": "简介或特色",
    "using_ingredients": [
      {"name": "食材名称", "amount": "推荐用量（如100g或2个）"},
      {"name": "食材名称", "amount": "推荐用量"}
    ],
    "ingredients_list":"所有包含的食材，要用编号分隔，换行请用<br>"
  },
  "extended_dish": {
    "dish": "第二道菜的名称（可以添加新食材）",
    "recipe": "详细步骤，建议写成流程表，要用编号，换行请用<br>",
    "description": "简介或特色",
    "using_ingredients": [
      {"name": "食材名称,如果是有提供食物才写在这里，否则写在extra_ingredients", "amount": "推荐用量（如100g或2个）"},
      {"name": "食材名称", "amount": "推荐用量"}
    ],
    "extra_ingredients": [
      {"name": "食材名称", "amount": "推荐用量（如100g或2个）"},
      {"name": "食材名称", "amount": "推荐用量"}
    ],
    "ingredients_list":"所有包含的食材，要用编号分隔，换行请用<br>"
  }
}`;


    const dishDiv = document.createElement("div");
    dishDiv.innerHTML = `<b>🍳 LOADING...</b><br>${validingredients.join("、")}`;
    dishDiv.style = "margin: 20px 0; padding: 10px; border: 1px dashed #999;";
    results.appendChild(dishDiv);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer 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"
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: recipePrompt }]
        })
      });

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "";

      let parsed;
      try {
        const match = reply.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
      } catch {
        parsed = null;
      }

            if (parsed) {
        dishDiv.innerHTML = `
        <div class="dish-card">
          <div class="dish-text result_block">
            <h3>🍽️ Dish 1: (Strict - Only Your Ingredients)</h3>
            <b>Name:</b> ${parsed.strict_dish.dish}<br>
            <b>Description:</b> ${parsed.strict_dish.description}<br>
            <b>Used Ingredients:</b><br>
            <ul>
              ${parsed.strict_dish.using_ingredients.map(ing => `<li>${ing.amount} of ${ing.name}</li>`).join("")}
            </ul>
            <b>Recipe:</b><br>${parsed.strict_dish.recipe}
          </div>
          <div class="dish-image" id="dishImage1">
            <p>Loading image...</p>
          </div>
          </div>
          <hr style="margin: 30px 0;">

          <div class="dish-card">
          <div class="dish-text result_block">
            <h3>🍽️ Dish 2: (Extended - With Additional Ingredients)</h3>
            <b>Name:</b> ${parsed.extended_dish.dish}<br>
            <b>Description:</b> ${parsed.extended_dish.description}<br>
            <b>Used Ingredients:</b><br>
            <ul>
              ${parsed.extended_dish.using_ingredients.map(ing => `<li>${ing.amount} of ${ing.name}</li>`).join("")}
            </ul>
            <b>Added Ingredients:</b><br>
            <ul>
              ${parsed.extended_dish.extra_ingredients.map(ing => `<li>${ing.amount} of ${ing.name}</li>`).join("")}
            </ul>
            <b>Recipe:</b><br>${parsed.extended_dish.recipe}
          </div>
          <div class="dish-image" id="dishImage2">
            <p>Loading image...</p>
          </div>
          </div>
        `;
dishDiv.classList.add("dish-card");

// 为 strict_dish 生成图片
const imageRes1 = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer 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"
  },
  body: JSON.stringify({
    model: "dall-e-2",
    prompt: `Realistic photo of a dish called ${parsed.strict_dish.dish}, beautifully plated, using only the ingredients in ${parsed.strict_dish.ingredients_list}.You cannot use any food else of the ingredients list expect common condiments (e.g., salt, pepper, soy sauce)`,
    n: 1,
    size: "512x512"
  })
});
const imageData1 = await imageRes1.json();
const imageUrl1 = imageData1.data?.[0]?.url;
if (imageUrl1) {
  document.getElementById("dishImage1").innerHTML = `<img src="${imageUrl1}" alt="Dish Image" width="300">`;
}

// 为 extended_dish 生成图片
const imageRes2 = await fetch("https://api.openai.com/v1/images/generations", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer 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"
  },
  body: JSON.stringify({
    model: "dall-e-2",
    prompt: `Realistic photo of a dish called ${parsed.extended_dish.dish}, beautifully plated, using only the ingredients in ${parsed.extended_dish.ingredients_list}.You cannot use any food else of the ingredients list expect common condiments (e.g., salt, pepper, soy sauce)`,
    n: 1,
    size: "512x512"
  })
});
const imageData2 = await imageRes2.json();
const imageUrl2 = imageData2.data?.[0]?.url;
if (imageUrl2) {
  document.getElementById("dishImage2").innerHTML = `<img src="${imageUrl2}" alt="Dish Image" width="300">`;
}


      } else {
        dishDiv.innerHTML = `<b>JSON cannot be parsed：</b><pre>${reply}</pre>`;
      }
    } catch (err) {
      dishDiv.innerHTML = `<b>Error when recommending recipe：</b><br>${err.message}`;
    }
  }
}
