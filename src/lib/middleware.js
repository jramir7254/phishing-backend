const jwt = require('jsonwebtoken');

const { connect, reset, run, get } = require('../database/sqlite')


const JWT_SECRET = "5955e3d0"

function signToken(claims) {

    const token = jwt.sign({ ...claims }, JWT_SECRET, {
        expiresIn: '30days'
    });

    console.debug('token.signed', { claims, token })
    return token;
}



async function authMiddleware(req, res, next) {
    // console.info("middleware.team")
    const authHeader = req.headers['authorization'];

    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        console.error('middleware.token.missing');
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }


    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.team = decoded; // attach user info (id, email, etc.)
        // console.debug('decoded.user', { decoded })

        if (decoded.isAdmin) {
            return next()
        }
        const team = await get('SELECT * FROM teams WHERE id = ?', [decoded.id])

        if (!team) {
            console.error('middleware.team.deleted');

            return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
        }

        return next();
    } catch (err) {
        console.error('middleware.token.invalid', err.message);
        res.status(403).json({ success: false, message: 'Invalid or expired token.' });
    }
}


function requireAdmin(req, res, next) {
    // console.info("middleware.admin")

    if (!req.team) {
        console.error('middleware.team.missing');
        return res.status(401).json({ success: false, error: 'Access denied. No user provided.' });
    }

    try {
        if (!(req.team?.isAdmin)) {

            return res.status(403).json({ success: false, message: 'Unauthorized action!' });
        }
        next();
    } catch (err) {
        console.error("middleware.team.unauthorized")
        res.status(403).json({ success: false, message: 'Unauthorized action!' });
    }
}


module.exports = { signToken, authMiddleware, requireAdmin }