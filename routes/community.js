// routes/community.js
const express = require('express');
const router  = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

let _db = null;
async function getDB() {
  if (_db) return _db;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  _db = client.db('raastkar');
  return _db;
}

// GET /api/community/posts
router.get('/posts', async (req, res) => {
  try {
    const db     = await getDB();
    const filter = req.query.filter || 'All';
    let query    = {};
    let sort     = { createdAt: -1 };

    if (filter === 'Help')     query.tag = 'Help';
    if (filter === 'Trending') sort = { likes: -1 };

    const posts = await db.collection('community_posts')
      .find(query).sort(sort).limit(50).toArray();

    res.json({ success: true, posts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/community/post
router.post('/post', async (req, res) => {
  try {
    const { userId, userName, text, tag, location } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Text required' });
    }

    const db   = await getDB();
    const post = {
      userId,
      userName:     userName || 'Farmer',
      userLocation: location || 'Pakistan',
      text:         text.trim(),
      tag:          tag || 'General',
      likes:        0,
      likedBy:      [],
      comments:     [],
      createdAt:    new Date().toISOString(),
    };

    const result = await db.collection('community_posts').insertOne(post);
    res.json({ success: true, postId: result.insertedId });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/community/like/:postId
router.post('/like/:postId', async (req, res) => {
  try {
    const { userId } = req.body;
    const db = await getDB();

    const post = await db.collection('community_posts')
      .findOne({ _id: new ObjectId(req.params.postId) });

    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const alreadyLiked = post.likedBy?.includes(userId);

    if (alreadyLiked) {
      // Unlike
      await db.collection('community_posts').updateOne(
        { _id: new ObjectId(req.params.postId) },
        { $inc: { likes: -1 }, $pull: { likedBy: userId } }
      );
    } else {
      // Like
      await db.collection('community_posts').updateOne(
        { _id: new ObjectId(req.params.postId) },
        { $inc: { likes: 1 }, $addToSet: { likedBy: userId } }
      );
    }

    res.json({ success: true, liked: !alreadyLiked });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/community/comment/:postId
router.post('/comment/:postId', async (req, res) => {
  try {
    const { userId, userName, text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: 'Text required' });

    const db = await getDB();
    const comment = {
      userId,
      userName: userName || 'Farmer',
      text,
      createdAt: new Date().toISOString(),
    };

    await db.collection('community_posts').updateOne(
      { _id: new ObjectId(req.params.postId) },
      { $push: { comments: comment } }
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/community/post/:postId
router.delete('/post/:postId', async (req, res) => {
  try {
    const { userId } = req.body;
    const db = await getDB();
    await db.collection('community_posts').deleteOne({
      _id: new ObjectId(req.params.postId),
      userId,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;