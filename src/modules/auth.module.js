const { connect } = require('../database/sqlite')
const { generateAccessCode } = require('../lib/utils')
const { signToken } = require('../lib/middleware')
// const { DuplicateResourceError, ResourceNotFoundError } = require('@shared/errors')


const ADMIN_CODE = "D3V"


const { Router } = require('express');

const routes = Router();


routes.post('/register', async (req, res) => {
    console.debug('auth.register', req.body);
    const accessToken = await register(req.body);
    console.info('registration finished', { accessToken });
    return res.status(200).json(accessToken);
});

routes.post('/login', async (req, res) => {
    console.debug('auth.login', req.body);
    const accessToken = await login(req.body);
    return res.status(200).json(accessToken);
});






const register = async (teamData) => {


    const db = await connect()
    const { teamName } = teamData

    const row = await db.get('SELECT * FROM teams WHERE team_name=?', [teamName])

    if (row) {
        console.warn('team already exists')
        throw new Error('Team already registered', 'teams', teamName)
    }

    const joinCode = generateAccessCode();
    console.info('generated access code', { joinCode })

    const { lastID } = await db.run(
        'INSERT INTO teams (team_name, join_code) VALUES(?,?)',
        [teamName, joinCode]
    )

    console.info('inserted team with id', { lastID })



    const token = signToken({
        id: lastID,
        teamName,
        joinCode,
        isAdmin: false,
    })

    return token
}



const login = async ({ joinCode }) => {


    if (joinCode === ADMIN_CODE) {
        console.debug('auth.login.is_admin', joinCode === ADMIN_CODE)

        return signToken({
            id: -1,
            teamName: "admin",
            joinCode,
            isAdmin: true
        })
    }



    const db = await connect()
    const row = await db.get('SELECT * FROM teams WHERE join_code = ?', [joinCode])

    if (!row) throw new Error('Team not found')

    console.debug('auth.login.found', row)

    const token = signToken({
        id: row.id,
        teamName: row.team_name,
        joinCode,
        isAdmin: false
    })

    return token
}






module.exports = routes;
