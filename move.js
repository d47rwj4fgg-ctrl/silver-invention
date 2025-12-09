document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    //  0. ヘルパー関数
    // ==========================================

    // 時間変換
    function timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    // 現在の状況判定
    function calculateRoomStatus(schedule) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes(); 
        const currentDay = now.getDay(); 

        const todaysSchedule = schedule.filter(cls => {
            return cls.day === undefined || cls.day === currentDay;
        });

        let status = "available";
        let statusText = "利用可能";
        let statusColor = "green";
        let userText = "(空室)";
        let timeMessage = "本日の授業は終了しました";

        todaysSchedule.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

        let foundCurrentClass = false;

        for (let i = 0; i < todaysSchedule.length; i++) {
            const cls = todaysSchedule[i];
            const startMin = timeToMinutes(cls.start);
            const endMin = timeToMinutes(cls.end);

            if (currentMinutes >= startMin && currentMinutes < endMin) {
                status = "occupied";
                statusText = "授業中";
                statusColor = "red";
                userText = cls.title;
                const diff = endMin - currentMinutes;
                timeMessage = `${cls.end} まで (${diff}分後終了)`;
                foundCurrentClass = true;
                break;
            }
        }

        if (!foundCurrentClass) {
            for (let i = 0; i < todaysSchedule.length; i++) {
                const cls = todaysSchedule[i];
                const startMin = timeToMinutes(cls.start);
                if (currentMinutes < startMin) {
                    const diff = startMin - currentMinutes;
                    timeMessage = `次の授業まで ${diff}分 (${cls.start}開始)`;
                    break;
                }
            }
        }
        return { status, statusText, statusColor, userText, timeMessage };
    }

    // タイムライン表生成
    function generateTimelineHTML(schedule) {
        const days = ["月", "火", "水", "木", "金"];
        const periods = [
            { name: "1限", start: "08:50" },
            { name: "2限", start: "10:30" },
            { name: "3限", start: "13:00" },
            { name: "4限", start: "14:40" },
            { name: "5限", start: "16:20" }
        ];

        let html = '<div class="timeline-container"><table class="timeline-table">';
        html += '<thead><tr><th>曜日</th>';
        periods.forEach(p => {
            html += `<th>${p.name}<br><span style="font-size:0.7em">${p.start}~</span></th>`;
        });
        html += '</tr></thead><tbody>';

        days.forEach((dayName, index) => {
            const dayNum = index + 1;
            html += `<tr><td class="day-header">${dayName}</td>`;
            periods.forEach(p => {
                const foundClass = schedule.find(s => s.day === dayNum && s.start === p.start);
                if (foundClass) {
                    html += `<td class="status-occupied">${foundClass.title}</td>`;
                } else {
                    html += `<td class="status-free">○</td>`;
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    // 口コミ保存・取得
    function getLocalReviews(roomId) {
        const storedReviews = localStorage.getItem('reviews_' + roomId);
        return storedReviews ? JSON.parse(storedReviews) : [];
    }
    function saveLocalReview(roomId, text) {
        const reviews = getLocalReviews(roomId);
        reviews.push(text);
        localStorage.setItem('reviews_' + roomId, JSON.stringify(reviews));
    }


    // ==========================================
    //  1. 画面切り替え & 初期化
    // ==========================================
    const allNavLinks = document.querySelectorAll('.nav-link');
    const searchLink = document.getElementById('nav-search');
    const floorLinks = document.querySelectorAll('.floor-link');
    const mapView = document.getElementById('map-view');
    const searchView = document.getElementById('search-view');
    const allFloorMaps = document.querySelectorAll('.floor-map-content');
    const mapTitle = document.getElementById('map-floor-title');
    
    // 検索画面の要素
    const searchKeyword = document.getElementById('search-keyword');
    const searchEquip = document.getElementById('search-equip');
    const searchStatus = document.getElementById('search-status');
    const searchResultsArea = document.getElementById('search-results-area');
    
    // 初期カテゴリのHTML保存
    let initialCategoriesHTML = "";
    const initialCategoriesElem = document.getElementById('initial-categories');
    if (initialCategoriesElem) {
        initialCategoriesHTML = initialCategoriesElem.outerHTML;
    }

    // 「検索」クリック
    if(searchLink) {
        searchLink.addEventListener('click', () => {
            allNavLinks.forEach(link => link.classList.remove('active'));
            searchLink.classList.add('active');
            if(searchView) searchView.classList.add('active');
            if(mapView) mapView.classList.remove('active');

            // 検索リセット
            if(searchKeyword) searchKeyword.value = "";
            if(searchEquip) searchEquip.value = "";
            if(searchStatus) searchStatus.value = "";
            if(searchResultsArea && initialCategoriesHTML) {
                searchResultsArea.innerHTML = initialCategoriesHTML;
            }
        });
    }

    // 「階層」クリック
    floorLinks.forEach(link => {
        link.addEventListener('click', () => {
            allNavLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            if(mapView) mapView.classList.add('active');
            if(searchView) searchView.classList.remove('active');

            const floorName = link.dataset.floor;
            if (mapTitle) mapTitle.textContent = `${floorName} フロアマップ`;

            allFloorMaps.forEach(map => map.classList.remove('active'));
            const targetMap = document.getElementById('map-' + floorName);
            if (targetMap) targetMap.classList.add('active');
            
            // 詳細エリアのリセット
            const detailsPrompt = document.getElementById('details-prompt');
            const dynamicContainer = document.getElementById('dynamic-details-container');
            if(dynamicContainer) dynamicContainer.innerHTML = "";
            if(detailsPrompt) detailsPrompt.classList.add('active');
            document.querySelectorAll('.classroom').forEach(r => r.classList.remove('selected'));
        });
    });


    // ==========================================
    //  2. 検索実行
    // ==========================================
    const executeSearchBtn = document.getElementById('execute-search-btn');

    function executeSearch() {
        const keyword = searchKeyword ? searchKeyword.value.trim() : "";
        const equip = searchEquip ? searchEquip.value : "";
        const statusReq = searchStatus ? searchStatus.value : "";

        let resultsHTML = '<h2>検索結果</h2><div class="map-right-side" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:10px;">';
        let count = 0;

        for (const roomId in roomDatabase) {
            const data = roomDatabase[roomId];
            // 検索条件チェック
            if (keyword && !data.name.includes(keyword)) continue;
            if (equip && !data.equipment.includes(equip)) continue;
            
            const currentStatus = calculateRoomStatus(data.schedule || []);
            if (statusReq === 'available' && currentStatus.status !== 'available') continue;

            resultsHTML += `
                <div class="classroom" data-room-id="${roomId}">
                    <span>${data.name}</span>
                    <span style="font-size:0.7em; color:${currentStatus.statusColor}">
                        ${currentStatus.statusText}
                    </span>
                </div>
            `;
            count++;
        }
        resultsHTML += '</div>';

        if (count === 0) {
            if(searchResultsArea) searchResultsArea.innerHTML = '<h2>検索結果</h2><p>条件に一致する教室は見つかりませんでした。</p>';
        } else {
            if(searchResultsArea) searchResultsArea.innerHTML = resultsHTML;
        }
    }

    if (executeSearchBtn) {
        executeSearchBtn.addEventListener('click', executeSearch);
    }


    // ==========================================
    //  3. 詳細表示 (コアロジック)
    // ==========================================
    const detailsPrompt = document.getElementById('details-prompt');
    const dynamicContainer = document.getElementById('dynamic-details-container');

    function showRoomDetails(roomId) {
        const data = roomDatabase[roomId];
        if (!data) return;

        // プロンプトを隠す
        if(detailsPrompt) detailsPrompt.classList.remove('active');

        // データ取得・生成
        const currentStatus = calculateRoomStatus(data.schedule || []);
        const timelineTable = generateTimelineHTML(data.schedule || []);
        
        const localReviews = getLocalReviews(roomId);
        const allReviews = (data.reviews || []).concat(localReviews);
        let reviewsListHtml = allReviews.map(r => `<li>${r}</li>`).join('');
        if (allReviews.length === 0) {
            reviewsListHtml = "<li>まだ口コミはありません。最初の投稿者になりましょう！</li>";
        }

        const htmlContent = `
            <div class="room-details-content active">
                <h3>${data.name}</h3>
                <div class="tabs">
                    <button class="tab-button active" data-target="tab-info">教室情報</button>
                    <button class="tab-button" data-target="tab-reviews">口コミ</button>
                </div>

                <div id="tab-info" class="tab-content active">
                    <h4>教室情報</h4>
                    <strong>状況:</strong> 
                    <span style="color: ${currentStatus.statusColor}; font-weight:bold; font-size:1.1em;">
                        ${currentStatus.statusText}
                    </span> 
                    (${currentStatus.timeMessage})<br>
                    <strong>設備:</strong> ${data.equipment || "情報なし"}<br>
                    <strong>使用者:</strong> ${currentStatus.userText}<br>
                    <hr>
                    <h4>週間スケジュール</h4>
                    ${timelineTable}
                </div>

                <div id="tab-reviews" class="tab-content">
                    <h4>口コミ一覧・投稿</h4>
                    <div style="background:#f9f9f9; padding:10px; border-radius:5px; margin-bottom:15px;">
                        <input type="text" id="review-input" placeholder="口コミを入力..." style="width:70%; padding:5px;">
                        <button id="submit-review-btn" data-room-id="${roomId}" style="padding:5px 10px;">投稿</button>
                    </div>
                    <ul id="reviews-list">${reviewsListHtml}</ul>
                </div>
            </div>
        `;

        if(dynamicContainer) dynamicContainer.innerHTML = htmlContent;
        
        // スマホ用: 詳細エリアへスクロール
        if (window.innerWidth <= 768) {
            const detailsArea = document.querySelector('.details-area');
            if (detailsArea) {
                setTimeout(() => {
                    detailsArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        }
    }


    // ==========================================
    //  ★重要: イベントデリゲーション (クリック監視の集約)
    // ==========================================
    // これにより、動的に追加されたボタンも全て反応します
    document.addEventListener('click', (e) => {
        
        // 1. 教室ボタン(.classroom)がクリックされた場合
        const roomBtn = e.target.closest('.classroom');
        if (roomBtn) {
            const roomId = roomBtn.dataset.roomId;
            if (roomId) {
                // ハイライト処理
                document.querySelectorAll('.classroom').forEach(r => r.classList.remove('selected'));
                roomBtn.classList.add('selected');

                // 検索画面から飛んできた場合の画面切り替え処理
                if (searchView && searchView.classList.contains('active')) {
                    searchView.classList.remove('active');
                    if(mapView) mapView.classList.add('active');
                    allNavLinks.forEach(l => l.classList.remove('active'));
                    // 1Fボタンをアクティブにする(簡易)
                    const f1Btn = document.querySelector('[data-floor="1F"]');
                    if(f1Btn) f1Btn.click(); // 1Fボタンを押したことにする
                }

                // 詳細表示
                showRoomDetails(roomId);
            }
            return;
        }

        // 2. カテゴリカードがクリックされた場合
        const catCard = e.target.closest('.category-card');
        if (catCard) {
            const type = catCard.dataset.searchType;
            const value = catCard.dataset.searchValue;
            if (type === 'status') {
                if(searchStatus) searchStatus.value = value;
                if(searchEquip) searchEquip.value = "";
            } else if (type === 'equip') {
                if(searchEquip) searchEquip.value = value;
                if(searchStatus) searchStatus.value = "";
            }
            if(searchKeyword) searchKeyword.value = "";
            executeSearch();
            return;
        }

        // 3. タブボタンがクリックされた場合
        const tabBtn = e.target.closest('.tab-button');
        if (tabBtn) {
            const targetId = tabBtn.dataset.target;
            const parent = tabBtn.closest('.room-details-content');
            
            // ボタンの切り替え
            parent.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');

            // コンテンツの切り替え
            parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const targetContent = parent.querySelector(`#${targetId}`);
            if(targetContent) targetContent.classList.add('active');
            return;
        }

        // 4. 教室口コミ投稿ボタン
        const reviewBtn = e.target.closest('#submit-review-btn');
        if (reviewBtn) {
            const input = document.getElementById('review-input');
            const list = document.getElementById('reviews-list');
            const roomId = reviewBtn.dataset.roomId;
            const text = input.value.trim();
            
            if (text === "") {
                alert("文字を入力してください");
                return;
            }
            saveLocalReview(roomId, text);
            const newLi = document.createElement('li');
            newLi.textContent = text;
            list.appendChild(newLi);
            input.value = "";
            return;
        }
    });


    // ==========================================
    //  5. サイト全体の口コミ機能
    // ==========================================
    const siteReviewList = document.getElementById('site-reviews-list');
    const siteReviewInput = document.getElementById('site-review-input');
    const siteReviewSubmit = document.getElementById('site-review-submit');
    const STORAGE_KEY_SITE = 'site_global_reviews';

    function loadSiteReviews() {
        const stored = localStorage.getItem(STORAGE_KEY_SITE);
        const reviews = stored ? JSON.parse(stored) : [];
        if(siteReviewList) {
            siteReviewList.innerHTML = "";
            if (reviews.length === 0) {
                siteReviewList.innerHTML = "<li style='text-align:center; color:#ccc;'>まだ投稿はありません。</li>";
            } else {
                reviews.slice().reverse().forEach(text => {
                    const li = document.createElement('li');
                    li.textContent = text;
                    siteReviewList.appendChild(li);
                });
            }
        }
    }

    if (siteReviewSubmit) {
        siteReviewSubmit.addEventListener('click', () => {
            const text = siteReviewInput.value.trim();
            if (!text) return;
            const stored = localStorage.getItem(STORAGE_KEY_SITE);
            const reviews = stored ? JSON.parse(stored) : [];
            reviews.push(text);
            localStorage.setItem(STORAGE_KEY_SITE, JSON.stringify(reviews));
            siteReviewInput.value = "";
            loadSiteReviews();
        });
    }

    loadSiteReviews();

});

