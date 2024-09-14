// Filename - pages/this_week.js

import {React, useState, useEffect} from "react";
import Container from 'react-bootstrap/Container';
import {Row, Col, Ratio, Button } from 'react-bootstrap';
import { useOrientation } from 'react-use';
import { useParams, useNavigate } from "react-router-dom";
import { 
    getMockGameData,
    getMonday,
    styles,
    componentStyles,
    processIncomingDataEvents, 
    buildGamesQueryUri 
} from "../Util";


import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var background = '/background.jpg'

var moment = require('moment');
moment.locale('fi')

const ThisWeek = (props) => {
    const navigate = useNavigate();
    const {timestamp} = useParams();
    const {type} = useOrientation();

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

      const DateBox = ({date, size, landscape}) => {
        const dateBoxStyle = Object.assign({}, {
            alignContent: 'center',
            justifyItems: 'center',
            alignSelf: 'center',
            aspectRatio: 1.0,
            height: '100%',
            borderRadius: '0px',
            boxShadow: '0px 5px 15px #000000', 
            background: "orange", 
            justifyContent: 'center', 
            alignItems: 'center'
        })

        const dayStyle = landscape ?  
            Object.assign({}, styles.flex, styles.textShadow, { fontSize: '1.6vw' }) : 
            Object.assign({}, styles.flex, styles.textShadow, { margin: '2px -10px 0px -10px', fontSize: '3.6vw' })
        
            const timeStyle = landscape ?  
            Object.assign({}, styles.flex, styles.textShadow, { fontSize: '1.4vw'}) :
            Object.assign({}, styles.flex, styles.textShadow, { margin: '-0px 0px 0px 0px', fontSize: '3.4vw'})

        return (
            <Ratio style={dateBoxStyle}>
                <Container>
                    <Row style={dayStyle}>{moment(date).format('dd D.M')}</Row>
                    <Row style={timeStyle}>{moment(date).format('HH:mm')}</Row>
                </Container>
            </Ratio>
        );
    }


      const gamesListPortrait = state.matches.map((data, index) => {
        const imageSize = '14wv'

        const smallTextStyle = Object.assign({}, styles.flex, { fontSize: '3vw' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { fontSize: '3vw' })
        const levelTextStyle = Object.assign({}, normalTextStyle, { justifyContent: 'start' })

        return (
            <Row key={index} style={{
                paddingBottom: '10px',
                height: '16vw'
                }}>
                <Col md='auto' style={{
                        alignSelf: 'center',
                        display: 'flex',
                        height: '100%',
                        width: '14vw',
                        aspectRatio: 1,
                        justifyContent: 'center', 'alignItems': 'center'
                        }}>
                    <DateBox size={imageSize} date={data.date}  landscape={false}/>
                </Col>
                <Col xs='auto' style={{height: '100%'}}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.home_logo} alt=""/>
                    </div>
                </Col>
                <Col xs='auto' style={smallTextStyle}>vs</Col>
                <Col xs='auto' style={{height: '100%'}}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.away_logo} alt=""/>
                    </div>
                </Col>
                <Col xs="auto" style={levelTextStyle}>{data.level}</Col>
            </Row>
        )
      })

      const navigateToAd = (index, data) => {
        console.log("Navigate to " + index)
        var formattedDate = moment(data.date).format('YYYY-MM-DD')
        navigate("/ads/" + formattedDate + "/" + index);
      }

      const gamesListLandscape = state.matches.map((data, index) => {
        const imageSize = '6wv'

        const buttonStyle = Object.assign({}, styles.flex, {width: '100%', height: '100%', padding:'0px 0px 0px 0px'} )
        const smallTextStyle = Object.assign({}, styles.flex, { fontSize: '1.5vw' })
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { textAlign: 'center', fontSize: '2vw', justifyContent: 'center' })
        const highlightTextStyle = Object.assign({}, styles.flex, styles.textHighlight, { textAlign: 'center', fontSize: '2vw', color: 'orange', justifyContent: 'center' })
        const levelTextStyle = Object.assign({}, normalTextStyle, { justifyContent: 'start' })
    
        return (
            <Row key={index} style={{
                paddingBottom: '10px',
                height: '6vw',
                }}>
                <Col xs={1} style={{
                        alignSelf: 'center',
                        display: 'flex',
                        height: '100%',
                        width: '7vw',
                        aspectRatio: 1,                            
                        justifyContent: 'center', 'alignItems': 'center'
                        }}>
                    <div style={buttonStyle} onClick={() => {navigateToAd(index, data)}}>
                        <DateBox size={imageSize} date={data.date} landscape={true}/>
                    </div>
                </Col>
                <Col xs={1} />
                <Col style={Object.assign({}, highlightTextStyle)}>{data.home}</Col>
                <Col xs='auto' style={{height: '100%'}}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.home_logo} alt=""/>
                    </div>
                </Col>
                <Col xs='auto' style={smallTextStyle}>vs</Col>
                <Col xs='auto' style={{height: '100%'}}>
                    <div style={componentStyles.logoContainer}>
                        <img style={componentStyles.logo} src={data.away_logo} alt=""/>
                    </div>
                </Col>
                <Col style={Object.assign({}, normalTextStyle)}>{data.away}</Col>
                <Col xs={2} style={levelTextStyle}>{data.level}</Col>
            </Row>
        )
      })

    const PortraitContent = () => {
        return (
            <div>
                { gamesListPortrait }
            </div>
        );
    }

    const LandscapeContent = () => {
        return (
            <div>
                { gamesListLandscape }
            </div>
        );
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
        const title = query.date ? "TULEVAT KOTIOTTELUT (" + week + ")" : "KOTIOTTELUT TÄLLÄ VIIKOLLA"

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

                        {
                            type === 'landscape-primary' ? 
                            (<LandscapeContent />) : 
                            (<PortraitContent />)
                        } 
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
