// Filename - pages/schedule.js

import React, { Fragment } from 'react'
import FullCalendar from '@fullcalendar/react'
import Container from 'react-bootstrap/Container';
import {Row, Col } from 'react-bootstrap';

import timeGridPlugin from '@fullcalendar/timegrid'
import bootstrapPlugin from '@fullcalendar/bootstrap';
import allLocales from '@fullcalendar/core/locales-all';

import "@fontsource/bebas-neue"; // Defaults to weight 400

import 'bootstrap/dist/css/bootstrap.css';
import '@fortawesome/fontawesome-free/css/all.css'; // needs additional webpack config!
import './fullcalendar.css'

class Schedule extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            items: []
        }
    }

    componentDidMount() {   
        fetch('api/schedule')
            .then(response => response.json())
            .then(data => {
                this.setState({ items: data })
            }).catch(error => {
                console.log('Error occurred! ', error);
            });
    }

    render() {
        const { items } = this.state
        var events = [];

        const big_font = '4vw'
        const title = { 'font-size': big_font, display: 'flex', justifyContent: 'center', alignItems: 'center', 'text-shadow': '0 0 2px #777777' }

        for (let i = 0; i < items.length; i++) {
            var item = items[i]

            var event = {
                id: item.id,
                title: item.text,
                start: item.start_date,
                end: item.end_date,
                backgroundColor: 'white',
                borderColor: 'black'
            }

            var isAhmaEvent = item.text.includes("Kiekko") && item.text.includes("Ahma")
            if (isAhmaEvent) {
                event.backgroundColor = 'orange'
                event.borderColor = 'orange'
            }

            var isBLDEvent = item.text.includes("BLD")
            if (isBLDEvent) {
                event.backgroundColor = 'orange'
                event.borderColor = 'orange'
            }

            events.push(event)
        }
        
        const imageSize = 120
        const ahmaLogo = 'https://static.jopox.fi/kiekko-ahma/logos/logo-300.png'
        const bldLogo = 'https://pbs.twimg.com/profile_images/648931227672580096/uLN1Orat_400x400.jpg'
        return (
            <Fragment>
                <Container style={{'font-family': 'Bebas Neue', padding: 20}}>
                    <Row>
                    <Col hidden='true' xs={0.1}><img src={ahmaLogo} width={imageSize} height={imageSize} alt=""/></Col>
                    <Col>
                        <div style={title}>JÄÄVUOROT</div>
                    </Col>
                    <Col hidden='true' xs={0.1}><img src={bldLogo} width={imageSize} height={imageSize} alt=""/></Col>
                    </Row>
                </Container>

            <div>
                <FullCalendar
                        plugins={[ bootstrapPlugin, timeGridPlugin ]}
                        initialView="timeGridWeek"
                        locales= {allLocales}
                        locale='fi'
                        weekends={true}
                        allDaySlot={false}
                        eventMinHeight={30}
                        titleFormat={{ year: 'numeric', month: 'long', day: 'numeric' }}
                        slotDuration="00:30:00"
                        slotMinTime="08:00:00"
                        slotMaxTime="23:30:00"
                        headerToolbar={{
                            left: '',
                            center: 'title',
                            right: '' // user can switch between the two
                        }}
                        slotLabelFormat={{
                            hour: '2-digit',
                            minute: '2-digit',
                            omitZeroMinute: false,
                            meridiem: 'short',
                            hour12: false
                        }}
                        firstDay={1}
                        eventTextColor='black'
                        themeSystem='bootstrap'
                        nowIndicator={true}
                        now={null}

                        events = {events}
                        //eventContent = {renderEventContent}
                    />
            </div>
            </Fragment>
        );
    }
}

export default Schedule;
