// Filename - pages/this_week.js

import React, { Fragment } from "react";
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
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
        const imageSize = 120
        //const items = [{"date":"2024-02-03","time":"18:15","home":"Kiekko-Ahma Valk.","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"K-Karhut","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114546.png","rink":"Valkeakoski","level":"U14 AA"},{"date":"2024-02-03","time":"15:25","home":"Kiekko-Ahma","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"LeKi Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/100025201.png","rink":"Valkeakoski","level":"U13 AA"},{"date":"2024-02-03","time":"14:00","home":"Kiekko-Ahma sininen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"HPK Valkoinen","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114740.png","rink":"Valkeakoski","level":"U11 sarja"},{"date":"2024-02-03","time":"16:50","home":"Kiekko-Ahma valkoinen","home_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10114407.png","away":"Uplakers Valkoiset","away_logo":"https://tulospalvelu.leijonat.fi/images/associations/weblogos/200x200/2024/10658853.png","rink":"Valkeakoski","level":"U11 sarja"}]
        
        const title = { 'font-size': '4em', display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 3px #777777' }
        const hometeam = { 'font-size': '2.5em', display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 3px #777777' }
        const awayteam = { 'font-size': '2.5em', display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 3px #777777' }
        const level = { 'font-size': '2.5em', display: 'flex', justifyContent: 'center', alignItems: 'center' }
        const style = { 'font-size': '1.6em', display: 'flex', justifyContent: 'center', alignItems: 'center' }
        const dayStyle = { margin: '5% 0% -20% 0%', 'font-size': '2em', display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 3px #777777' }
        const monthStyle = { 'font-size': '1.3em', display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 3px #777777'  }

        const gamesList = items.map((data) => {
            return (
                <Row style={{'padding': 5}}>
                    <Col xs={1} style={style}>
                        <Container style={{'box-shadow': '0px 0px 15px #BBBBBB', background: 'orange', aspectRatio: 1, justifyContent: 'center', 'alignItems': 'center'}}>
                            <Row style={dayStyle}>{moment(data.date).format('D.M')}</Row>
                            <Row style={monthStyle}>{data.time}</Row>
                        </Container>
                    </Col>
                    <Col style={hometeam}>{data.home}</Col>
                    <Col xs={0.1} style={style}><img src={data.home_logo} width={imageSize} height={imageSize} alt="LOGO"/></Col>
                    <Col xs={1} style={style}>vs.</Col>
                    <Col xs={0.1} style={style}><img src={data.away_logo} width={imageSize} height={imageSize} alt="LOGO"/></Col>
                    <Col style={awayteam}>{data.away}</Col>
                    <Col style={level}>{data.level}</Col>
                </Row>
            )
          })

        // Define the layout configuration for each grid item
        return (
            <Fragment>
                <div style={{'font-family': 'Bebas Neue', padding: 50}}>
                    <Container style={{paddingBottom:50}}>
                        <div style={title}>KIEKKO-AHMA - TULEVAT KOTIOTTELUT</div>
                    </Container>
                    { gamesList }
                </div>
            </Fragment>
        );
    }
}

export default ThisWeek;
