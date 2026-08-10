-- 1) Fix the 3 preset campaigns to the Haven Ground voice with {{sender}} tokens.
update campaigns set steps = '[
  {"delayMins":0,"value":0,"unit":"minutes","type":"text","message":"Hi {{first}}, this is {{sender}} with Haven Ground. Saw you reached out about the land you wanted us to look at, I would love to help. When is a good time to connect?"},
  {"delayMins":1440,"value":1,"unit":"days","type":"text","message":"Hey {{first}}, just following up. Happy to answer any questions and there is no pressure at all. What works for a quick call?"},
  {"delayMins":2880,"value":2,"unit":"days","type":"call","label":"Call new lead"},
  {"delayMins":5760,"value":4,"unit":"days","type":"text","message":"Hi {{first}}, still glad to help with the land whenever the timing is right for you. Shoot me a text anytime."},
  {"delayMins":10080,"value":7,"unit":"days","type":"call","label":"Call new lead"},
  {"delayMins":14400,"value":10,"unit":"days","type":"text","message":"Hey {{first}}, checking in one more time. If now is not the right time no worries, I am here when you are ready."}
]'::jsonb where name = 'New Lead, No Contact';

update campaigns set steps = '[
  {"delayMins":4320,"value":3,"unit":"days","type":"call","label":"Follow up after family talk"},
  {"delayMins":10080,"value":7,"unit":"days","type":"text","message":"Hi {{first}}, hope you and the family had a chance to talk it over. Happy to answer anything that came up. No rush."},
  {"delayMins":20160,"value":14,"unit":"days","type":"call","label":"Follow up: family decision"}
]'::jsonb where name = 'Talking to Family';

update campaigns set steps = '[
  {"delayMins":2880,"value":2,"unit":"days","type":"call","label":"Follow up on offer"},
  {"delayMins":7200,"value":5,"unit":"days","type":"text","message":"Hi {{first}}, just circling back on our offer. Any questions I can answer to make this easy for you?"},
  {"delayMins":14400,"value":10,"unit":"days","type":"call","label":"Follow up on offer"}
]'::jsonb where name = 'Offer Pending';

-- 2) Fix any ALREADY-QUEUED drip texts so no more go out with the wrong name.
update campaign_queue
set message = replace(replace(message, 'Jordan with Harmon Land', 'Anthony with Haven Ground'), 'Harmon Land', 'Haven Ground')
where status = 'pending';
