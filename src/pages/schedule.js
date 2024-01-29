// Filename - pages/schedule.js

import React, { Fragment } from 'react'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import bootstrapPlugin from '@fullcalendar/bootstrap';

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
        items.map(item => (
            events.push({
                id: item.id,
                title: item.text,
                start: item.start_date,
                end: item.end_date
            })
        ))

        return (
            <Fragment>
            <div>
                <FullCalendar
                        plugins={[ bootstrapPlugin, timeGridPlugin ]}
                        initialView="timeGridWeek"
                        weekends={true}
                        allDaySlot={false}
                        eventMinHeight={30}
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
                        eventColor='orange'
                        eventBorderColor='orange'
                        eventTextColor='black'
                        themeSystem='bootstrap'
                        now={null}

                        events = {events}
                        //events={[
                        //    { title: 'Kiekko-Ahma U12', start: new Date(2024, 0, 29, 14, 0, 0), end: new Date(2024, 0, 29, 14, 50, 0) },
                        //    { title: 'Kiekko-Ahma U13',start: new Date(2024, 0, 29, 15, 0, 0), end: new Date(2024, 0, 29, 15, 50, 0) }
                        //]}
                    />
            </div>
            </Fragment>
        );
    }
}

export default Schedule;
