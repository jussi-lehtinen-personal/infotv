// Filename - pages/this_week.js

import {React, useState, useEffect} from "react";
import {Row, Col } from 'react-bootstrap';
import { useParams, useNavigate } from "react-router-dom";
import { 
    getMockGameData,
    getMonday,
    styles,
    componentStyles,
    processIncomingDataEvents, 
    buildGamesQueryUri,
    getAdsUri
} from "../Util";


import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var moment = require('moment');
moment.locale('fi')

const ThisWeek = (props) => {
    const navigate = useNavigate();
    const {timestamp} = useParams();

    const [state, setState] = useState({
        matches: [],
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
            setState({ matches: dataItems })
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

      const gamesListLandscape = state.matches.map((data, index) => {

        const fullHeight = Object.assign({},{ height: '5.5vw', width:'100%' })
        const smallTextStyle = Object.assign({}, styles.flex, { fontSize: '1.5vw', color: '#000000ff' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { textAlign: 'center', fontSize: '2vw', justifyContent: 'start', color: '#000000ff' })
        const highlightTextStyle = Object.assign({}, styles.flex, styles.textHighlight, { textAlign: 'center', fontSize: '2vw', color: 'orange', justifyContent: 'end' })
        const levelTextStyle = Object.assign({}, normalTextStyle, { justifyContent: 'start' })
        const goalTextStyle = Object.assign({}, styles.flex, { textAlign: 'center', fontSize: '3vw', justifyContent: 'center', color: '#000000ff' })

        const lineStyle = Object.assign({}, {
            height: '3px', 
            width: '100%', 
            background: '#f0f0f0ff'})
            
        return (
            <div style={fullHeight} onClick={() => {navigate(getAdsUri(index, data))}}>
                <Row key={index} style={{
                    paddingTop: '10px',
                    paddingBottom: '10px',
                    height: '5.5vw',
                    }}>
                    <Col xs={1} style={normalTextStyle}>{moment(data.date).format('dd D.M')}</Col>
                    <Col xs="auto" style={highlightTextStyle}>{moment(data.date).format('HH:mm')}</Col>

                    <Col xs={3} style={Object.assign({}, highlightTextStyle)}>{data.home}</Col>
                    <Col xs='auto' style={{height: '100%'}}>
                        <div style={componentStyles.logoContainer}>
                            <img style={componentStyles.logo} src={data.home_logo} alt=""/>
                        </div>
                    </Col>
                    
                    {
                        data.finished ?  
                        (<Col xs={1} style={{textAlign: 'center', justifyContent: 'center'}}>
                            <Row xs={4} style={{textAlign: 'center', justifyContent: 'center'}}>
                                <div style={goalTextStyle}>{data.home_goals}</div>
                                <div style={goalTextStyle}>-</div>
                                <div style={goalTextStyle}>{data.away_goals} </div>
                            </Row>
                        </Col>) :
                        (<Col xs={1} style={smallTextStyle}>vs</Col>)
                    }                      

                    <Col xs='auto' style={{height: '100%'}}>
                        <div style={componentStyles.logoContainer}>
                            <img style={componentStyles.logo} src={data.away_logo} alt=""/>
                        </div>
                    </Col>
                    <Col xs={3} style={Object.assign({}, normalTextStyle)}>{data.away}</Col>
                    <Col xs="auto" style={levelTextStyle}>{data.level}</Col>
                </Row>
                <div style={lineStyle}></div>
            </div>
        )
      })

    const Content = () => {
        const titleTextStyle = Object.assign({}, styles.flex, {fontSize: '4vw', color: '#000000ff'})
        const lineStyle = Object.assign({}, {
            height: '3px', 
            width: '100%', 
            background: `radial-gradient( orange, orange, orange )`
            })

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

        // Determine date range
        var title = "KOTIOTTELUT TÄLLÄ VIIKOLLA"
        
        if (query.date) {
            const currentWeekMonday = getMonday(new Date())
            if (startOfWeek < currentWeekMonday) {
                title = "PELATUT KOTIOTTELUT (" + week + ")"
            } else {
                title = "TULEVAT KOTIOTTELUT (" + week + ")"
            }
        }

        return (
            <div style={{height: "100vh", background: "#ffffffff" }}>
                <Col>
                    <div style={Object.assign({}, styles.font, {margin: '0px 5vw 0px 5vw'})}>
                        <div>
                            <div style={Object.assign({}, styles.flex, titleTextStyle)}>{title}</div>
                            <div style={lineStyle}></div>
                        </div>

                        { gamesListLandscape }
                    </div>
                </Col>
            </div>
        ) 
    }


    return ( 
        <Content />
    )
}

export default ThisWeek;
