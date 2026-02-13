// server.js
const express = require('express');
const ytdl = require('ytdl-core');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for your frontend
app.use(cors({
    origin: 'https://bluethsprojectsite.fun' // Replace with your frontend URL
}));

// Endpoint to search and get audio
app.get('/api/youtube-audio', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query) {
            return res.status(400).json({ error: 'Search query required' });
        }

        console.log(`Searching for: ${query}`);

        // First, search for the video
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const searchResponse = await fetch(searchUrl);
        const searchHtml = await searchResponse.text();
        
        // Extract first video ID
        const videoIdMatch = searchHtml.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (!videoIdMatch) {
            return res.status(404).json({ error: 'No videos found' });
        }

        const videoId = videoIdMatch[1];
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // Get video info
        const info = await ytdl.getInfo(videoUrl);
        
        // Get the best audio format
        const audioFormat = ytdl.chooseFormat(info.formats, { 
            filter: 'audioonly',
            quality: 'lowestaudio' // Use lowest quality for faster streaming
        });

        // Return video info and stream URL
        res.json({
            success: true,
            videoId: videoId,
            title: info.videoDetails.title,
            duration: info.videoDetails.lengthSeconds,
            audioUrl: `/api/stream-audio?url=${encodeURIComponent(videoUrl)}`,
            thumbnail: info.videoDetails.thumbnails[0].url
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Endpoint to stream audio
app.get('/api/stream-audio', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).send('URL required');
        }

        // Set headers for audio streaming
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');

        // Stream the audio
        const stream = ytdl(url, {
            filter: 'audioonly',
            quality: 'lowestaudio',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        });

        stream.pipe(res);

        stream.on('error', (error) => {
            console.error('Stream error:', error);
            res.status(500).send('Streaming failed');
        });

    } catch (error) {
        console.error('Stream error:', error);
        res.status(500).send('Failed to stream audio');
    }
});

// Simple cache for song snippets
const snippetCache = new Map();

// Endpoint to get a specific snippet
app.get('/api/song-snippet', async (req, res) => {
    try {
        const { url, startTime = 30, duration = 15 } = req.query;
        
        if (!url) {
            return res.status(400).send('URL required');
        }

        const cacheKey = `${url}-${startTime}`;
        
        // Check cache first
        if (snippetCache.has(cacheKey)) {
            const cached = snippetCache.get(cacheKey);
            res.setHeader('Content-Type', 'audio/mpeg');
            return res.send(cached);
        }

        // Get video info for duration check
        const info = await ytdl.getInfo(url);
        const videoDuration = parseInt(info.videoDetails.lengthSeconds);
        
        // Ensure snippet doesn't exceed video duration
        const safeStartTime = Math.min(startTime, Math.max(0, videoDuration - duration));
        const endTime = Math.min(safeStartTime + duration, videoDuration);

        // Stream just the snippet
        const stream = ytdl(url, {
            filter: 'audioonly',
            quality: 'lowestaudio',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        });

        // Collect the audio data
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        
        stream.on('end', () => {
            const audioBuffer = Buffer.concat(chunks);
            // Cache for 1 hour
            snippetCache.set(cacheKey, audioBuffer);
            setTimeout(() => snippetCache.delete(cacheKey), 3600000);
            
            res.setHeader('Content-Type', 'audio/mpeg');
            res.send(audioBuffer);
        });

        stream.on('error', (error) => {
            console.error('Snippet error:', error);
            res.status(500).send('Failed to get snippet');
        });

    } catch (error) {
        console.error('Snippet error:', error);
        res.status(500).send('Failed to process snippet');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
