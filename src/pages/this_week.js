// Filename - pages/this_week.js

import React, { Fragment } from "react";
import Container from 'react-bootstrap/Container';
import {Row, Col, Ratio } from 'react-bootstrap';
import "@fontsource/bebas-neue"; // Defaults to weight 400
import 'moment/locale/fi'  // without this line it didn't work
var moment = require('moment');
moment.locale('fi')

class ThisWeek extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            items: []
        }
    }

    componentDidMount() {   
        fetch('api/getGames')
        .then(response => response.json())
        .then(data => {
            this.setState({ items: data })
        }).catch(error => {
            console.log('Error occurred! ', error);
        });
    }

    render() {
        const { items } = this.state
        const imageSize = '120'
        //const items = [{"date":"2024-02-03 14:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HPK Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114740.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 15:25","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"LeKi Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/100025201.png","rink":"Valkeakoski","level":"U13 AA"},{"date":"2024-02-03 16:50","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers Valkoiset","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03 18:15","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"K-Karhut","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114546.png","rink":"Valkeakoski","level":"U14 AA"}]

        const big_font = '4vw'
        const medium_font = '2vw'
        const date_font = '2.6vw'
        const small_font = '1.5vw'
        const smaller_font = '1.7vw'
        
        const title = { 'font-size': big_font, display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 2px #777777' }
        const team = { 'font-size': medium_font, display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 2px #777777' }
        const level = { 'font-size': medium_font, display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 2px #777777' }
        const style = { 'font-size': small_font }
        const small = { 'font-size': small_font, display: 'flex', justifyContent: 'center', alignItems: 'center' }
        const dayStyle = { margin: '0px 0px -10px 0px', 'font-size': date_font, display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 2px #777777' }
        const monthStyle = { 'font-size': smaller_font, display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 3px #777777'  }

        const gamesList = items.map((data) => {
            return (
                <Row style={{'padding': 5}}>
                    <Col xs={1}>
                        <Ratio style={{height: '100%', 'box-shadow': '0px 5px 15px #BBBBBB', background: 'orange', justifyContent: 'center', 'alignItems': 'center'}}>
                            <Container> 
                                <Row style={dayStyle}>{moment(data.date).format('D.M')}</Row>
                                <Row style={monthStyle}>{moment(data.date).format('HH:mm')}</Row>
                            </Container>
                        </Ratio>
                    </Col>
                    <Col style={team}>{data.home}</Col>
                    <Col xs={0.1} style={style}><img src={data.home_logo} width={imageSize} height={imageSize} alt="LOGO"/></Col>
                    <Col xs={1} style={small}>vs.</Col>
                    <Col xs={0.1} style={style}><img src={data.away_logo} width={imageSize} height={imageSize} alt="LOGO"/></Col>
                    <Col style={team}>{data.away}</Col>
                    <Col xs={2} style={level}>{data.level}</Col>
                </Row>
            )
          })

        // Define the layout configuration for each grid item
        return (
            <Fragment>
                <div style={{'font-family': 'Bebas Neue', padding: 20}}>
                    <Container style={{paddingBottom:50}}>
                        <div style={title}>KIEKKO-AHMA - TULEVAT KOTIOTTELUT</div>
                        <div style={{height: '5px', width: '100%', 'box-shadow': '0px 5px 15px #BBBBBB', 'border-top': '1px solid orange', background: 'orange', aspectRatio: 1, justifyContent: 'center', 'alignItems': 'center'}}></div>
                    </Container>
                    { gamesList }
                </div>
            </Fragment>
        );
    }
}

export default ThisWeek;
