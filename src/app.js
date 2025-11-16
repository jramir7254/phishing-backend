//src/app.js

const express = require('express');
const cors = require('cors');
const { reset } = require('./database/sqlite')

const { requireAdmin, authMiddleware } = require('./lib/middleware');


const authRoutes = require('./modules/auth.module')
const gameRoutes = require('./modules/game.module')
const adminRoutes = require('./modules/admin.module')

const app = express();
app.use(cors());
app.use(express.json());






// --- Express routes ---
app.get('/api', async (req, res) => {
    console.log('call made');
    return res.send('we up')
});


app.use('/auth', authRoutes)
// app.use('/questions', questionRoutes)
app.use('/admin', authMiddleware, requireAdmin, adminRoutes)
app.use('/game', gameRoutes)


app.use((err, req, res, next) => {
    console.error('error', { err });
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(status).json({ success: false, message });
});



module.exports = app;
