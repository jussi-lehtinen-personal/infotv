// Filename - pages/this_week.js

import React from "react";
import Container from 'react-bootstrap/Container';
import {Row, Col, Ratio } from 'react-bootstrap';
import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work

var background = '/background.jpg'

var moment = require('moment');
moment.locale('fi')

const styles = {
    font: {
        'font-family': 'Bebas Neue',
        'color': '#EEEEEE'
    },
    
    textShadow: {
        'text-shadow': '0 3px 5px #000000'
    },

    textHighlight: {
        'text-shadow': '0 3px 2px #000000'
    },

    boxShadow: {
        'box-shadow': '0px 3px 15px #000000'
    },

    flex: {
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
    },

}

class ThisWeek extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            matches: []
        }
    }

    componentDidMount() {   
        fetch('api/getGames')
        .then(response => response.json())
        .then(data => {
            this.setState({ matches: data })
        }).catch(error => {
            console.log('Error occurred! ', error);
        });
    }

    render() {
        const { matches } = this.state
        //const matches = [{"date":"2024-02-03 14:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HPK Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114740.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 15:25","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"LeKi Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/100025201.png","rink":"Valkeakoski","level":"U13 AA"},{"date":"2024-02-03 16:50","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers Valkoiset","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 18:15","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"K-Karhut","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114546.png","rink":"Valkeakoski","level":"U14 AA"}]

        const imageSize = 120

        var dataItems = []
        matches.map((data) => { return dataItems.push(data) })

        if (dataItems.length > 6) {
            dataItems = matches.slice(0, 5)
        } else {
            while (dataItems.length < 6) {
                dataItems.push({
                    date: "",
                    home: "",
                    home_logo: "",
                    away: "",
                    away_logo: "",
                    rink: "",
                    level: ""
                })
            }
        }
        
        const dateBoxStyle = Object.assign({}, {
            alignContent: 'center',
            justifyItems: 'center',
            alignSelf: 'center',
            aspectRatio: 1,
            height: {imageSize},
            width: {imageSize}, 
            'box-shadow': '0px 5px 15px #000000', 
            background: "orange", 
            justifyContent: 'center', 'alignItems': 'center'
        })

        const smallTextStyle = Object.assign({}, styles.flex, { 'font-size': '1.5vw' })
        const titleTextStyle = Object.assign({}, styles.flex, styles.textShadow, {'font-size': '4vw'})
        const normalTextStyle = Object.assign({}, styles.flex, styles.textShadow, { 'font-size': '2vw' })
        const highlightTextStyle = Object.assign({}, styles.flex, styles.textHighlight, { 'font-size': '2vw', color: 'orange' })
        const dayStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '0px 0px -10px 0px', 'font-size': '2.6vw' })
        const timeStyle = Object.assign({}, styles.flex, styles.textShadow, { margin: '0px 0px 0px 0px', 'font-size': '1.9vw'})
        const imageStyle = Object.assign({}, styles.boxShadow, { backgroundColor: 'white', padding: '5px', borderRadius: '10%', objectFit: 'contain' })

        const gamesList = dataItems.map((data) => {
            const isValidItem = data.home.length > 0

            return (
                <Row style={{'padding': 5, opacity: isValidItem ? 1 : 0.5}}>
                    <Col xs={1} style={{
                            alignSelf: 'center',
                            justifyContent: 'center', 'alignItems': 'center'
                            }}>
                        {/* Date / time box */}
                        <Ratio style={dateBoxStyle}>
                            <Container> 
                                <Row style={dayStyle}>{isValidItem ? moment(data.date).format('dd') : ""}</Row>
                                <Row style={timeStyle}>{isValidItem ? moment(data.date).format('HH:mm') : ""}</Row>
                            </Container>
                        </Ratio>
                    </Col>
                    <Col hidden={isValidItem ? false : true} style={highlightTextStyle}>{data.home}</Col>
                    <Col xs={0.1} hidden={isValidItem ? false : true}>
                        <img style={imageStyle} src={data.home_logo} width={imageSize} height={imageSize} alt=""/>
                    </Col>
                    <Col hidden={isValidItem ? false : true} xs={1} style={smallTextStyle}>vs</Col>
                    <Col xs={0.1} hidden={isValidItem ? false : true}>
                        <img style={imageStyle} src={data.away_logo} width={imageSize} height={imageSize} alt=""/>
                    </Col>
                    <Col style={normalTextStyle}>{data.away}</Col>
                    <Col xs={2} style={normalTextStyle}>{data.level}</Col>
                </Row>
            )
          })

        // Define the layout configuration for each grid item
        const now = new Date()
        var startOfWeek = new Date()
        startOfWeek.setDate(now.getDate() - (now.getDay() + 6) % 7);

        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(endOfWeek.getDate() + 6)

        const start = moment(startOfWeek).format('D.M')
        const end = moment(endOfWeek).format('D.M')

        const week = start + ' - ' + end

        const lineStyle = Object.assign({}, styles.boxShadow, {
            height: '5px', 
            width: '100%', 
            'box-shadow': '0px 5px 15px #000000', 
            'border-top': '1px solid orange', 
            background: 'orange'})

        return (
            <div style={{ height: "100vh", background: "#000000" }}>
                <Col style={{
                    background: `linear-gradient( rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 1.0) ), url(${background})`, 
                    backgroundSize: 'cover',
                    backgroundColor: '#000000',
                    backgroundRepeat: 'no-repeat' }}>
                    <div style={Object.assign({}, styles.font, {padding: '0px 0px 0px 50px'})}>
                        <Container style={{paddingBottom:50}}>
                            <div style={titleTextStyle}>TULEVAT KOTIOTTELUT ({week})</div>
                            <div style={lineStyle}></div>
                        </Container>
                        { gamesList }
                    </div>
                </Col>
            </div>
        );
    }
}

export default ThisWeek;
