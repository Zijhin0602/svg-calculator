window.onload = function() { 
    const fileInput = document.getElementById('dxfFile'); 
    fileInput.accept = ".svg";  // 更改接受的文件類型
    fileInput.addEventListener('change', function(event) { 
        const file = event.target.files[0]; 
        if (file) { 
            processFile(file); 
        } 
    }); 
};

function processFile(file) { 
    const reader = new FileReader(); 
    reader.onload = function(e) { 
        try { 
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(e.target.result, "image/svg+xml");
            const circles = svgDoc.getElementsByTagName('circle');
            
            // 解析SVG中的圓形
            const parsedCircles = Array.from(circles).map(circle => ({
                type: 'CIRCLE',
                radius: parseFloat(circle.getAttribute('r')),
                center: {
                    x: parseFloat(circle.getAttribute('cx')),
                    y: parseFloat(circle.getAttribute('cy'))
                },
                layer: circle.getAttribute('class') || 'default'
            }));

            // 檢測圓形顏色
            checkCircleColors(parsedCircles);

            calculateTotalAreaFromSVG(parsedCircles); 
            displayResults();
            renderSvgPreview(parsedCircles); 
        } catch (error) { 
            console.error('Error parsing or rendering SVG:', error); 
            alert('解析或渲染 SVG 時發生錯誤: ' + error.message); 
        } 
    }; 
    reader.onerror = function(e) { 
        console.error('Error reading file:', e); 
        alert('讀取文件時發生錯誤'); 
    }; 
    reader.readAsText(file); 
}

// 添加全域變數
let totalYellowArea = 0;
let totalGreenArea = 0;
let totalBlueArea = 0;
let totalBlueVisibleArea = 0;

// 將圓形轉換為路徑的輔助函數
function circleToPath(circle) {
    const x = circle.center.x;
    const y = circle.center.y;
    const r = circle.radius;
    
    // SVG 圓形路徑
    return `M ${x-r},${y} 
            a ${r},${r} 0 1,0 ${r*2},0 
            a ${r},${r} 0 1,0 ${-r*2},0`;
}

// 計算路徑面積的函數
function getPathArea(pathString) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathString);
    // 使用 getTotalLength 方法計算周長
    const len = path.getTotalLength();
    const points = [];
    const num = 100; // 精度，可調整

    // 獲取路徑上的點
    for (let i = 0; i < num; i++) {
        const pt = path.getPointAtLength(i * len / (num - 1));
        points.push([pt.x, pt.y]);
    }

    // 使用多邊形面積公式計算
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i][0] * points[j][1];
        area -= points[j][0] * points[i][1];
    }
    return Math.abs(area / 2);
}

function calculateTotalAreaFromSVG(circles) {
    totalYellowArea = 0;
    totalGreenArea = 0;
    totalBlueArea = 0;
    totalBlueVisibleArea = 0;

    const yellowPaths = [];
    const bluePaths = [];

    // 分類並轉換圓形為路徑
    circles.forEach(circle => {
        const pathString = circleToPath(circle);
        if (circle.layer === 'yellow') {
            yellowPaths.push(pathString);
            totalYellowArea += getPathArea(pathString);
        } else if (circle.layer === 'blue') {
            bluePaths.push(pathString);
            totalBlueArea += getPathArea(pathString);
        }
    });

    // 計算交集面積
    if (yellowPaths.length && bluePaths.length) {
        // 創建臨時 SVG 來計算交集
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.visibility = "hidden";
        document.body.appendChild(svg);

        // 合併所有黃色路徑
        const yellowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        yellowPath.setAttribute("d", yellowPaths.join(" "));
        yellowPath.setAttribute("fill-rule", "evenodd");

        // 合併所有藍色路徑
        const bluePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        bluePath.setAttribute("d", bluePaths.join(" "));
        bluePath.setAttribute("fill-rule", "evenodd");

        // 計算交集面積
        const intersectionPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        intersectionPath.setAttribute("d", yellowPaths.join(" ") + " " + bluePaths.join(" "));
        intersectionPath.setAttribute("fill-rule", "evenodd");

        totalGreenArea = getPathArea(intersectionPath.getAttribute("d"));
        totalBlueVisibleArea = totalBlueArea - totalGreenArea;

        // 清理臨時 SVG
        document.body.removeChild(svg);
    }
}

function renderSvgPreview(circles) {
    console.log('開始渲染 SVG 預覽...');
    const el = document.getElementById('previewCanvas');
    el.innerHTML = '';

    // 計算邊界框
    let bounds = {
        min: { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
        max: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }
    };

    // 先計算所有圓形的邊界
    circles.forEach(circle => {
        bounds.min.x = Math.min(bounds.min.x, circle.center.x - circle.radius);
        bounds.min.y = Math.min(bounds.min.y, circle.center.y - circle.radius);
        bounds.max.x = Math.max(bounds.max.x, circle.center.x + circle.radius);
        bounds.max.y = Math.max(bounds.max.y, circle.center.y + circle.radius);
    });

    // 計算實際尺寸
    const width = bounds.max.x - bounds.min.x;
    const height = bounds.max.y - bounds.min.y;
    
    // 調整預覽視窗大小
    const padding = 20;
    const maxWidth = Math.min(window.innerWidth - 40, 1200); // 最大寬度限制在1200px
    const maxHeight = Math.min(window.innerHeight - 40, 800); // 最大高度限制在800px
    
    // 計算縮放比例
    const scale = Math.min(
        (maxWidth - 2 * padding) / width,
        (maxHeight - 2 * padding) / height
    );

    // 創建 SVG 元素並設置合適的大小
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", maxWidth);
    svg.setAttribute("height", maxHeight);
    svg.setAttribute("viewBox", `${bounds.min.x - padding/scale} ${bounds.min.y - padding/scale} ${width + 2*padding/scale} ${height + 2*padding/scale}`);
    svg.style.backgroundColor = "#f0f0f0";

    // 使用 viewBox 代替 transform
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // 批量處理圓形
    const fragment = document.createDocumentFragment();
    circles.forEach(circle => {
        const svgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        svgCircle.setAttribute("cx", circle.center.x);
        svgCircle.setAttribute("cy", circle.center.y);
        svgCircle.setAttribute("r", circle.radius);
        
        // 設置顏色
        if (circle.layer === 'yellow') {
            svgCircle.setAttribute("fill", "rgb(255, 255, 0)");
            svgCircle.setAttribute("stroke", "#FFD700");
        } else if (circle.layer === 'blue') {
            svgCircle.setAttribute("fill", "rgb(0, 0, 255)");
            svgCircle.setAttribute("stroke", "#0000FF");
        } else {
            svgCircle.setAttribute("fill", "rgb(128, 128, 128)");
            svgCircle.setAttribute("stroke", "#808080");
        }
        
        svgCircle.setAttribute("stroke-width", "1");
        fragment.appendChild(svgCircle);
    });

    g.appendChild(fragment);
    svg.appendChild(g);
    el.appendChild(svg);

    console.log(`渲染完成，共處理 ${circles.length} 個圓形`);
}

// 更新 displayResults 函數來顯示計算結果
function displayResults() {
    document.getElementById('yellowArea').textContent = totalYellowArea.toFixed(2);
    document.getElementById('blueArea').textContent = totalBlueArea.toFixed(2);
    document.getElementById('greenArea').textContent = totalGreenArea.toFixed(2);
    document.getElementById('blueVisibleArea').textContent = totalBlueVisibleArea.toFixed(2);
}

// 新增檢測函數
function checkCircleColors(circles) {
    let hasYellow = false;
    let hasBlue = false;
    let message = [];

    circles.forEach(circle => {
        if (circle.layer === 'yellow') hasYellow = true;
        if (circle.layer === 'blue') hasBlue = true;
    });

    if (!hasYellow && !hasBlue) {
        message.push("警告：未檢測到黃色或藍色圓形！");
    } else {
        if (!hasYellow) message.push("警告：未檢測到黃色圓形！");
        if (!hasBlue) message.push("警告：未檢測到藍色圓形！");
    }

    // 更新檢測結果到頁面
    const statusElement = document.getElementById('detectionStatus');
    if (message.length > 0) {
        statusElement.textContent = message.join(' ');
        statusElement.style.color = 'red';
    } else {
        statusElement.textContent = "已成功檢測到黃色和藍色圓形";
        statusElement.style.color = 'green';
    }
}
