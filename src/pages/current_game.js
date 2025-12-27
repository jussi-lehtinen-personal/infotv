// Filename - pages/current_game.js

import {React, useState, useEffect} from "react";
import Container from 'react-bootstrap/Container';
import {Row, Col } from 'react-bootstrap';
import { useParams } from "react-router-dom";
import { 
    getMockGameData,
    getMonday,
    styles,
    componentStyles,
    processIncomingDataEvents, 
    buildGamesQueryUri,
} from "../Util";


import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var background = '/background.jpg'  

var moment = require('moment');
moment.locale('fi')

const CurrentGame = (props) => {
    const {timestamp} = useParams();

    const [state, setState] = useState({
        match: {},
    });

    const [query, setQuery] = useState({
        date: timestamp
    });

    useEffect(() => {
        setQuery({date: timestamp})
    }, [timestamp])

    useEffect(() => {
        var uri = buildGamesQueryUri(query.date)

        const setMatchData = (d) => {

            var dataItems = processIncomingDataEvents(d)    
            setState({ match: dataItems.at(0) })
        }    

        fetch(uri)
        .then(response => response.json())
        .then(data => {
            setMatchData(data)
        }).catch(error => {
            const data = getMockGameData()
            setMatchData(data)
            console.log('Error occurred! ', error);
        });
      }, [query.date])


    const MatchOverview = () => {
        const fullWidth = Object.assign({}, styles.flex, { height: "6vw", width:'100%' })
        const smallTextStyle = Object.assign({}, styles.flex, { fontSize: '1.5vw', backgroundColor: 'black' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { textAlign: 'center', fontSize: '2.5vw', justifyContent: 'center' })
        const highlightTextStyle = Object.assign({}, styles.flex, styles.textHighlight, { textAlign: 'center', fontSize: '2.5vw', color: 'orange', justifyContent: 'center' })
        const normalScoreTextStyle = Object.assign({}, styles.flex, styles.textShadow, { textAlign: 'center', fontSize: '6vw', justifyContent: 'center' })
        const highlightScoreTextStyle = Object.assign({}, styles.flex, styles.textHighlight, { textAlign: 'center', fontSize: '6vw', color: 'orange', justifyContent: 'center' })

        var data = state.match
        
        return (
            <div style={fullWidth}>
                <Col xs={1}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.home_logo} alt=""/>
                    </div>
                </Col>
                <Col style={Object.assign({}, highlightTextStyle)}>{data.home}</Col>
                <Col xs={1} style={highlightScoreTextStyle}>{data.home_goals}</Col>
                <Col xs='auto' style={smallTextStyle}>{Number(data.period) + 1}</Col>
                <Col xs={1} style={normalScoreTextStyle}>{data.away_goals}</Col>
                <Col style={Object.assign({}, normalTextStyle)}>{data.away}</Col>
                <Col xs={1}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.away_logo} alt=""/>
                    </div>
                </Col>
            </div>
        )
    }

    const Content = () => {
        const titleTextStyle = Object.assign({}, styles.flex, styles.textShadow, {fontSize: '4vw'})
        const lineStyle = Object.assign({}, styles.boxShadow, {
            height: '5px', 
            width: '100%', 
            boxShadow: '0px 5px 15px #000000', 
            background: `radial-gradient( white, orange, black )`, 
            })

        // Define the layout configuration for each grid item
        var now = new Date()
        if (query.date) {
            now = new Date(query.date)
        }

        const startOfWeek = getMonday(now)
        console.log(query.date)
        console.log(startOfWeek)
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(endOfWeek.getDate() + 6)

        const start = moment(startOfWeek).format('D.M')
        const end = moment(endOfWeek).format('D.M')

        const week = start + ' - ' + end
        const title = query.date ? "SERUAAVA PELITAPAHTUMA (" + week + ")" : "OTTELUTAPAHTUMAT"

        return (
            <div style={{height: "100vh", background: "#000000" }}>
                <Col style={{
                    background: `linear-gradient( rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 1.0) ), url(${background})`, 
                    backgroundSize: 'cover',
                    backgroundColor: '#000000',
                    backgroundRepeat: 'no-repeat' }}>
                    <div style={Object.assign({}, styles.font, {margin: '0px 5vw 0px 5vw'})}>
                        <Container style={{paddingBottom: '2vh'}}>
                            <div style={Object.assign({}, styles.flex, titleTextStyle)}>{title}</div>
                            <div style={lineStyle}></div>
                        </Container>
                        <MatchOverview/>
                    </div>
                </Col>
            </div>
        ) 
    }


    return ( 
        <Content />
    )
}

export default CurrentGame;
