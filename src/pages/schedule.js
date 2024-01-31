// Filename - pages/schedule.js

import React, { Fragment } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import bootstrapPlugin from '@fullcalendar/bootstrap';
import allLocales from '@fullcalendar/core/locales-all';

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

        function renderEventContent(eventInfo) {
            return (
                <div>
                    <strong>{eventInfo.timeText}</strong>
                    <p>{eventInfo.event.title}</p>
                </div>
            )
        }

        return (
            <Fragment>
            <div style={{margin: '100px 0px 0px 0px'}}>
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
