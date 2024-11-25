// 全局变量
let player;
let videoId;
let channelNumber = 1;
let isMin = false;
let isMuted = true;
let isOn = true;
let currentVolume = 50;
let captionsEnabled = true;  // 新增：字幕启用状态

// 从localStorage获取上次的设置
if (localStorage.getItem('channelNumber')) {
    channelNumber = parseInt(localStorage.getItem('channelNumber'));
}
if (localStorage.getItem('isMin') === 'true') {
    isMin = true;
}
if (localStorage.getItem('captionsEnabled') === 'false') {
    captionsEnabled = false;
}

function onYouTubeIframeAPIReady() {
    console.log("YouTube API 已就绪");
    
    // 先加载频道列表，然后初始化播放器
    getList().then(list => {
        if (list) {
            videoId = getVideoId(channelNumber);
            if (videoId) {
                console.log('初始化播放器，视频ID:', videoId);
                
                // 隐藏静态噪声和测试卡
                const staticNoise = document.querySelector('.static-noise');
                const smpte = document.querySelector('.smpte');
                if (staticNoise) staticNoise.style.opacity = '0';
                if (smpte) smpte.style.opacity = '0';
                
                player = new YT.Player('player', {
                    height: '100%',
                    width: '100%',
                    videoId: videoId,
                    playerVars: {
                        'playsinline': 1,
                        'iv_load_policy': 3,
                        'cc_load_policy': 1,
                        'cc_lang_pref': 'zh',
                        'controls': 0,
                        'rel': 0,
                        'mute': 1,
                        'autoplay': 1,
                        'enablejsapi': 1,
                        'modestbranding': 1,
                        'origin': window.location.origin,
                        'hl': 'zh'
                    },
                    events: {
                        'onReady': onPlayerReady,
                        'onStateChange': onPlayerStateChange,
                        'onError': onErrorOccured,
                        'onApiChange': onApiChange
                    }
                });
                
                resizePlayer();
                window.addEventListener('resize', resizePlayer);
            } else {
                console.error('无法获取有效的视频ID');
            }
        } else {
            console.error('无法加载频道列表');
        }
    });
}

function onApiChange(event) {
    console.log('YouTube API状态改变');
    try {
        if (player && player.loadModule) {
            player.loadModule('captions');
            // 增加重试次数计数
            let retryCount = 0;
            const maxRetries = 3;
            
            const tryLoadCaptions = () => {
                try {
                    const tracks = player.getOption('captions', 'tracklist') || [];
                    console.log('可用字幕列表:', tracks);
                    
                    if (tracks.length > 0) {
                        console.log('发现字幕，尝试启用');
                        // 查找中文字幕
                        const zhTrack = tracks.find(t => 
                            t.languageCode.startsWith('zh') || 
                            t.displayName.toLowerCase().includes('chinese')
                        );
                        
                        if (zhTrack) {
                            console.log('找到中文字幕:', zhTrack);
                            player.setOption('captions', 'track', zhTrack);
                        } else {
                            console.log('未找到中文字幕，使用第一个可用字幕:', tracks[0]);
                            player.setOption('captions', 'track', tracks[0]);
                        }
                        
                        // 设置字幕样式
                        player.setOption('captions', 'displaySettings', {
                            'backgroundColor': '#000000',
                            'backgroundOpacity': 70,
                            'textOpacity': 100,
                            'fontSize': 2,
                            'edge': 'raised'
                        });
                        
                        return true; // 字幕加载成功
                    } else {
                        console.log('没有找到字幕，尝试启用自动字幕');
                        player.setOption('captions', 'track', {
                            'languageCode': 'zh',
                            'kind': 'asr'
                        });
                        
                        // 如果还没有达到最大重试次数，继续尝试
                        if (retryCount < maxRetries) {
                            retryCount++;
                            console.log(`字幕加载重试 (${retryCount}/${maxRetries})...`);
                            setTimeout(tryLoadCaptions, 2000); // 2秒后重试
                            return false;
                        }
                    }
                } catch (error) {
                    console.error('设置字幕时出错:', error);
                    // 如果还没有达到最大重试次数，继续尝试
                    if (retryCount < maxRetries) {
                        retryCount++;
                        console.log(`字幕加载重试 (${retryCount}/${maxRetries})...`);
                        setTimeout(tryLoadCaptions, 2000); // 2秒后重试
                        return false;
                    }
                }
            };
            
            // 首次尝试加载字幕
            setTimeout(tryLoadCaptions, 1000);
        }
    } catch (error) {
        console.error('API改变事件处理出错:', error);
    }
}

function playChannel(num, force = false) {
    if (!isOn) return;
    if (!force && num === channelNumber) return;

    const newVideoId = getVideoId(num);
    if (!newVideoId) {
        console.error('无法获取视频ID，尝试下一个频道');
        switchChannel(1);
        return;
    }
    
    channelNumber = num;
    videoId = newVideoId;
    
    console.log('加载新视频:', videoId);
    player.loadVideoById({
        'videoId': videoId,
        'startSeconds': 0,
        'suggestedQuality': 'large'
    });

    // 等待视频加载完成后重新应用字幕设置
    let retryCount = 0;
    const maxRetries = 3;
    
    const tryEnableCaptions = () => {
        if (captionsEnabled) {
            try {
                player.loadModule('captions');
                const tracks = player.getOption('captions', 'tracklist') || [];
                console.log('新视频可用字幕:', tracks);
                
                if (tracks.length > 0) {
                    const zhTrack = tracks.find(t => 
                        t.languageCode.startsWith('zh') || 
                        t.displayName.toLowerCase().includes('chinese')
                    );
                    
                    if (zhTrack) {
                        player.setOption('captions', 'track', zhTrack);
                    } else {
                        player.setOption('captions', 'track', tracks[0]);
                    }
                    return true; // 字幕加载成功
                } else {
                    player.setOption('captions', 'track', {
                        'languageCode': 'zh',
                        'kind': 'asr'
                    });
                    
                    // 如果还没有达到最大重试次数，继续尝试
                    if (retryCount < maxRetries) {
                        retryCount++;
                        console.log(`新视频字幕加载重试 (${retryCount}/${maxRetries})...`);
                        setTimeout(tryEnableCaptions, 2000);
                        return false;
                    }
                }
            } catch (error) {
                console.error('切换频道时设置字幕出错:', error);
                // 如果还没有达到最大重试次数，继续尝试
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`新视频字幕加载重试 (${retryCount}/${maxRetries})...`);
                    setTimeout(tryEnableCaptions, 2000);
                    return false;
                }
            }
        }
    };
    
    // 首次尝试启用字幕
    setTimeout(tryEnableCaptions, 2000);

    updateChannelDisplay();
    localStorage.setItem('channelNumber', channelNumber);
}

function toggleCaptions() {
    captionsEnabled = !captionsEnabled;
    console.log('字幕状态:', captionsEnabled ? '开启' : '关闭');
    
    try {
        if (captionsEnabled) {
            player.loadModule('captions');
            const tracks = player.getOption('captions', 'tracklist') || [];
            if (tracks.length > 0) {
                player.setOption('captions', 'track', tracks[0]);
            } else {
                player.setOption('captions', 'track', {
                    'languageCode': 'zh',
                    'kind': 'asr'
                });
            }
        } else {
            player.unloadModule('captions');
        }
        
        localStorage.setItem('captionsEnabled', captionsEnabled);
    } catch (error) {
        console.error('切换字幕状态时出错:', error);
    }
}

function onPlayerReady(event) {
    console.log('播放器已就绪');
    initSettings();
    
    // 确保字幕设置被立即应用
    try {
        player.loadModule('captions');
        // 启用自动字幕
        player.setOption('captions', 'displaySettings', {
            'background': '#00000066',
            'backgroundOpacity': 0.8,
            'textOpacity': 1,
            'windowOpacity': 0,
            'fontSize': 2
        });
        player.setOption('captions', 'track', {
            'languageCode': 'zh-CN',
            'kind': 'asr'  // 启用自动语音识别字幕
        });
        player.setOption('captions', 'reload', true);
        console.log('播放器字幕设置已应用');
    } catch (error) {
        console.error('应用字幕设置时出错:', error);
    }
}

function onPlayerStateChange(event) {
    console.log('播放器状态变化:', event.data);
    
    switch(event.data) {
        case YT.PlayerState.PLAYING:
            console.log('视频开始播放');
            // 视频开始播放时重新应用字幕设置
            setTimeout(() => {
                try {
                    player.loadModule('captions');
                    player.setOption('captions', 'track', {
                        'languageCode': 'zh-CN',
                        'kind': 'asr'
                    });
                    player.setOption('captions', 'reload', true);
                    console.log('播放时字幕设置已更新');
                } catch (error) {
                    console.error('更新字幕设置时出错:', error);
                }
            }, 1000);
            break;
            
        case YT.PlayerState.ENDED:
            console.log('视频播放结束，切换到下一个视频');
            switchChannel(1);
            break;
            
        case YT.PlayerState.PAUSED:
            console.log('视频暂停');
            break;
    }
}

function onErrorOccured(event) {
    console.log('播放器错误:', event.data);
    switch(event.data) {
        case 2:
            console.error("无效的视频ID");
            break;
        case 5:
            console.error("HTML5播放器错误");
            break;
        case 100:
            console.error("无法找到视频");
            break;
        case 101:
        case 150:
            console.error("视频不允许嵌入播放");
            break;
        default:
            console.error("未知错误:", event.data);
    }
    
    // 对于所有错误，尝试切换到下一个频道
    switchChannel(1);
}

function toggleShowCaptions() {
    console.log('切换字幕显示状态');
    const checkbox = document.getElementById('show-captions-checkbox');
    if (!checkbox || !player) return;
    
    checkbox.checked = !checkbox.checked;
    
    if (checkbox.checked) {
        player.loadModule('captions');
        player.setOption('captions', 'track', {'languageCode': 'en'});
    } else {
        player.unloadModule('captions');
    }
    
    // 保存设置到localStorage
    localStorage.setItem('showCaptions', checkbox.checked);
    console.log('字幕显示状态:', checkbox.checked);
}

function toggleDisplayChannelName() {
    console.log('切换频道名显示状态');
    const checkbox = document.getElementById('display-channel-name-checkbox');
    if (!checkbox) return;
    
    const channelName = document.querySelector('.channel-name');
    if (!channelName) return;
    
    checkbox.checked = !checkbox.checked;
    channelName.style.display = checkbox.checked ? 'block' : 'none';
    
    // 保存设置到localStorage
    localStorage.setItem('displayChannelName', checkbox.checked);
    console.log('频道名显示状态:', checkbox.checked);
}

function changeVolume(step) {
    if (!player || !isOn) return;
    
    // 计算新音量
    currentVolume = Math.max(0, Math.min(100, currentVolume + step));
    console.log(`调整音量: ${currentVolume}%`);
    
    // 更新播放器音量
    player.setVolume(currentVolume);
    
    // 更新音量显示
    updateVolumeDisplay();
    
    // 如果之前是静音状态，取消静音
    if (isMuted && currentVolume > 0) {
        isMuted = false;
        player.unMute();
        updateMuteIcon();
    }
    
    // 如果音量为0，自动静音
    if (currentVolume === 0) {
        isMuted = true;
        player.mute();
        updateMuteIcon();
    }
    
    // 保存音量设置
    localStorage.setItem('volume', currentVolume);
    localStorage.setItem('muted', isMuted);
}

function updateVolumeDisplay() {
    const volumeSteps = document.querySelector('.volume-steps');
    if (!volumeSteps) return;
    
    // 显示音量条
    volumeSteps.style.display = "flex";
    
    // 更新音量步进显示
    const stepsContainer = volumeSteps.querySelector(".steps");
    if (!stepsContainer) return;
    
    stepsContainer.innerHTML = ''; // 清空现有步进
    
    // 创建音量步进显示
    const totalSteps = 10;
    const activeSteps = Math.round(currentVolume / 100 * totalSteps);
    
    for (let i = 0; i < totalSteps; i++) {
        const step = document.createElement("div");
        step.className = "step";
        if (i < activeSteps) {
            step.classList.add("active");
        }
        stepsContainer.appendChild(step);
    }
    
    // 更新音量文本
    const volumeText = volumeSteps.querySelector(".text");
    if (volumeText) {
        volumeText.textContent = `音量: ${currentVolume}%`;
    }
    
    // 3秒后隐藏音量显示
    clearTimeout(window.volumeDisplayTimeout);
    window.volumeDisplayTimeout = setTimeout(() => {
        volumeSteps.style.display = "none";
    }, 3000);
}

function updateMuteIcon() {
    const muteIcon = document.querySelector('.muteIcon');
    if (!muteIcon) return;
    
    muteIcon.src = isMuted ? "icons/volume-x.svg" : "icons/volume-2.svg";
}

function toggleGuide() {
    if (!isOn) {
        console.log('电视未开启，不显示频道列表');
        return;
    }
    
    const guide = document.querySelector(".guide");
    if (!guide) {
        console.error('找不到guide元素');
        return;
    }
    
    console.log('切换频道列表显示状态');
    if (guide.style.display === "flex") {
        console.log('关闭频道列表');
        guide.style.display = "none";
    } else {
        console.log('显示频道列表');
        guide.style.display = "flex";
        updateGuideContent();
    }
}

function updateGuideContent() {
    console.log('开始更新频道列表');
    
    const content = document.querySelector(".guide .content");
    if (!content) {
        console.error('找不到guide content元素');
        return;
    }
    
    // 获取频道列表数据
    const list = JSON.parse(localStorage.getItem('list'));
    if (!list) {
        console.error('频道列表数据不存在');
        return;
    }
    
    content.innerHTML = ''; // 清空现有内容
    
    // 频道列表标题
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "频道列表";
    content.appendChild(title);
    
    // 创建频道列表
    const channels = Object.keys(list).sort((a, b) => parseInt(a) - parseInt(b));
    console.log('排序后的频道列表:', channels);
    
    channels.forEach(ch => {
        const channelItem = document.createElement("div");
        channelItem.className = "channel-item";
        channelItem.onclick = () => {
            playChannel(parseInt(ch), true);
            toggleGuide(); // 选择后关闭指南
        };
        
        // 频道号
        const number = document.createElement("div");
        number.className = "number";
        number.textContent = ch;
        
        // 频道名
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = getChannelName(ch);
        
        // 当前频道高亮显示
        if (parseInt(ch) === channelNumber) {
            channelItem.classList.add("active");
        }
        
        channelItem.appendChild(number);
        channelItem.appendChild(name);
        content.appendChild(channelItem);
    });
}

function toggleFullScreen() {
    console.log('切换全屏状态');
    
    if (!document.fullscreenElement && 
        !document.mozFullScreenElement && 
        !document.webkitFullscreenElement && 
        !document.msFullscreenElement) {
        // 进入全屏
        const element = document.documentElement;
        if (element.requestFullscreen) {
            element.requestFullscreen();
        } else if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
        } else if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        }
        console.log('进入全屏模式');
    } else {
        // 退出全屏
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        console.log('退出全屏模式');
    }
}

// 监听全屏状态变化
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

function handleFullscreenChange() {
    const fullscreenImg = document.querySelector(".fullscreen img");
    if (!fullscreenImg) return;
    
    if (document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement || 
        document.msFullscreenElement) {
        fullscreenImg.src = "icons/minimize-2.svg";
    } else {
        fullscreenImg.src = "icons/maximize-2.svg";
    }
}

function toggleShowCaptions() {
    console.log('切换字幕显示状态');
    const checkbox = document.getElementById('show-captions-checkbox');
    if (!checkbox || !player) return;
    
    checkbox.checked = !checkbox.checked;
    
    if (checkbox.checked) {
        player.loadModule('captions');
        player.setOption('captions', 'track', {'languageCode': 'en'});
    } else {
        player.unloadModule('captions');
    }
    
    // 保存设置到localStorage
    localStorage.setItem('showCaptions', checkbox.checked);
    console.log('字幕显示状态:', checkbox.checked);
}

// 初始化设置
function initSettings() {
    console.log('初始化设置');
    
    // 从localStorage获取设置
    if (localStorage.getItem('volume')) {
        currentVolume = parseInt(localStorage.getItem('volume'));
    }
    if (localStorage.getItem('muted') === 'true') {
        isMuted = true;
    }
    if (localStorage.getItem('isMin') === 'true') {
        isMin = true;
        const control = document.querySelector('.control');
        const minButton = document.querySelector('.min-button img');
        if (control) control.classList.add('minimized');
        if (minButton) minButton.src = 'icons/maximize-2.svg';
    }
    
    // 初始化播放器状态
    if (player) {
        player.setVolume(currentVolume);
        if (isMuted) {
            player.mute();
        } else {
            player.unMute();
        }
        
        // 确保字幕设置被应用
        try {
            player.loadModule('captions');
            player.setOption('captions', 'track', {'languageCode': 'zh-CN'});
            player.setOption('captions', 'reload', true);
            console.log('字幕设置已初始化');
        } catch (error) {
            console.error('初始化字幕设置时出错:', error);
        }
    }
    
    // 更新UI
    updateMuteIcon();
    updateVolumeDisplay();
}

function toggleMin() {
    console.log('切换最小化状态');
    const control = document.querySelector('.control');
    const minButton = document.querySelector('.min-button img');
    
    if (!control || !minButton) {
        console.error('找不到控制面板或最小化按钮');
        return;
    }
    
    isMin = !isMin;
    console.log('最小化状态:', isMin);
    
    if (isMin) {
        control.classList.add('minimized');
        minButton.src = 'icons/maximize-2.svg';
    } else {
        control.classList.remove('minimized');
        minButton.src = 'icons/minimize-2.svg';
    }
    
    // 保存设置
    localStorage.setItem('isMin', isMin);
}

// 在文档加载完成后初始化最小化状态
document.addEventListener('DOMContentLoaded', () => {
    console.log('初始化最小化状态');
    const control = document.querySelector('.control');
    const minButton = document.querySelector('.min-button img');
    
    if (control && minButton) {
        if (localStorage.getItem('isMin') === 'true') {
            isMin = true;
            control.classList.add('minimized');
            minButton.src = 'icons/maximize-2.svg';
        } else {
            isMin = false;
            control.classList.remove('minimized');
            minButton.src = 'icons/minimize-2.svg';
        }
    }
    
    // 为最小化按钮添加点击事件
    const minButtonElement = document.querySelector('.min-button');
    if (minButtonElement) {
        minButtonElement.onclick = toggleMin;
    }
});

// 使用新的YouTube IFrame API加载方式
if (!window.YT) {
    console.log('正在加载 YouTube IFrame API...');
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function togglePower() {
    const powerScreen = document.querySelector('.power-screen');
    const staticNoise = document.querySelector('.static-noise');
    
    if (isOn) {
        if (powerScreen) {
            powerScreen.style.display = "block";
            powerScreen.style.animation = "tvoff .4s linear";
            powerScreen.style.opacity = 1;
        }
        if (staticNoise) staticNoise.style.opacity = '1';
        isOn = false;
        if (player) player.stopVideo();
    } else {
        if (powerScreen) {
            powerScreen.style.animation = "tvon 1s linear";
            powerScreen.style.opacity = 0;
            setTimeout(function () {
                powerScreen.style.display = "none";
            }, 1000);
        }
        if (staticNoise) staticNoise.style.opacity = '0';
        isOn = true;
        playChannel(channelNumber, true);
    }
}

function getList() {
    return fetch('list.json')
        .then(response => response.json())
        .then(data => {
            localStorage.setItem('list', JSON.stringify(data));
            console.log('频道列表已加载:', data);
            return data;
        })
        .catch(error => {
            console.error('加载频道列表失败:', error);
            // 尝试从localStorage获取缓存的列表
            const cachedList = localStorage.getItem('list');
            if (cachedList) {
                console.log('使用缓存的频道列表');
                return JSON.parse(cachedList);
            }
            return null;
        });
}

function getVideoId(channelNum) {
    try {
        const list = JSON.parse(localStorage.getItem('list'));
        if (!list || !list[channelNum]) {
            console.error('无效的频道号或频道列表未加载');
            return null;
        }
        
        // 获取频道中的第一个视频ID
        const videos = list[channelNum];
        if (videos && videos['1']) {
            console.log(`获取频道 ${channelNum} 的视频:`, videos['1'].id);
            return videos['1'].id;
        }
        
        console.error('频道中没有视频');
        return null;
    } catch (error) {
        console.error('获取视频ID时出错:', error);
        return null;
    }
}

function resizePlayer() {
    const p = document.querySelector("#player");
    if (p && player && player.setSize) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        console.log(`调整播放器大小: ${width}x${height}`);
        player.setSize(width, height);
    }
}

function switchChannel(a) {
    if (!isOn) return;
    
    const totalChannels = 12;
    let newChannel = channelNumber + a;
    
    // 实现循环切换
    if (newChannel < 1) {
        newChannel = totalChannels;  // 如果小于1，切换到最后一个频道
    } else if (newChannel > totalChannels) {
        newChannel = 1;  // 如果大于最大频道数，切换到第一个频道
    }
    
    console.log(`切换频道：${channelNumber} -> ${newChannel}`);
    playChannel(newChannel, true);
}

function getChannelName(channel) {
    // 确保channel是数字
    const channelNum = parseInt(channel);
    
    let name = "...";
    switch (channelNum) {
        case 1: name = "科技 Sci & Tech"; break;
        case 2: name = "旅游 Travel"; break;
        case 3: name = "美食 Food"; break;
        case 4: name = "建筑 Architecture"; break;
        case 5: name = "电影 Film"; break;
        case 6: name = "纪录片 Documentaries"; break;
        case 7: name = "喜剧 Comedy"; break;
        case 8: name = "音乐 Music"; break;
        case 9: name = "汽车 Autos"; break;
        case 10: name = "新闻 News"; break;
        case 11: name = "格斗 UFC"; break;
        case 12: name = "播客 Podcasts"; break;
    }
    return name;
}

function toggleMute() {
    if (!player || !isOn) return;
    
    if (isMuted) {
        player.unMute();
        player.setVolume(currentVolume);
        isMuted = false;
    } else {
        player.mute();
        isMuted = true;
    }
    
    updateMuteIcon();
    console.log('静音状态:', isMuted ? '开启' : '关闭');
}

function updateChannelDisplay() {
    const channelNameElem = document.querySelector('.channel-name');
    if (!channelNameElem) return;
    
    let displayText = channelNumber < 10 ? `CH 0${channelNumber}` : `CH ${channelNumber}`;
    displayText += ` - ${getChannelName(channelNumber)}`;
    channelNameElem.textContent = displayText;
    console.log('更新频道显示:', displayText);
}
