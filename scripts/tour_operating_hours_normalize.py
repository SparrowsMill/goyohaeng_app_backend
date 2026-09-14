#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import html
import os
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

load_dotenv('.env')
DATABASE_URL = os.getenv('DIRECT_URL') or os.getenv('DATABASE_URL')
if not DATABASE_URL:
    raise RuntimeError('DIRECT_URL or DATABASE_URL is not set')

REPORT_DIR = Path('reports/operating_hours')

DAY_TO_NUM = {'월':1,'화':2,'수':3,'목':4,'금':5,'토':6,'일':7}
DAY_WORD_TO_NUM = {'월요일':1,'화요일':2,'수요일':3,'목요일':4,'금요일':5,'토요일':6,'일요일':7}
NUM_TO_DAY_NAME = {1:'MON',2:'TUE',3:'WED',4:'THU',5:'FRI',6:'SAT',7:'SUN'}

DANGEROUS_MARKERS = (
    '상이','하절기','동절기','계절','시즌','공휴일','법정공휴일','대체공휴일',
    '명절','설날','추석','첫째','둘째','셋째','넷째','다섯째','격주','매월',
    '비정기','부정기','임시','점포별','점포 별','매장별','매장 별','업체별','업체 별',
    '공연별','공연 별','행사별','행사 별','날씨','기상','현장상황','현장 상황',
    '변동','전화문의','전화 문의','익일','다음날','매년','초복','중복','말복','복날',
    '방문 제한시간','방문 제한 시간','전시 기간','전시 준비', '달마다', '매달', '월마다'
)

SPECIFIC_DATE_RE = re.compile(r'(?<!\d)(?:1[0-2]|0?[1-9])\s*월\s*(?:3[01]|[12]?\d)\s*일(?!\d)')
MONTH_EXCEPTION_RE = re.compile(r'(?<!\d)(?:1[0-2]|0?[1-9])\s*월(?:은|에는|부터|까지)')

TIME_RANGE_RE = re.compile(
    r'(?<!\d)([01]?\d|2[0-3]|24):([0-5]\d)\s*'
    r'(?:~|～|−|–|—|-)\s*'
    r'([01]?\d|2[0-3]|24):([0-5]\d)(?!\d)'
)
SINGLE_TIME_RE = re.compile(r'(?<!\d)([01]?\d|2[0-3]|24):([0-5]\d)(?!\d)')
BREAK_RE = re.compile(
    r'(?:준비\s*시간|브레이크\s*타임|휴게\s*시간)\s*[:：]?\s*'
    r'(?<!\d)([01]?\d|2[0-3]|24):([0-5]\d)\s*'
    r'(?:~|～|−|–|—|-)\s*'
    r'([01]?\d|2[0-3]|24):([0-5]\d)(?!\d)', re.IGNORECASE
)
DAY_RANGE_RE = re.compile(
    r'(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)'
    r'\s*(?:~|～|−|–|—|-)\s*'
    r'(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)'
)

DAY_TOKEN_PATTERN = (
    r'(?:월요일|화요일|수요일|목요일|금요일|토요일|일요일|'
    r'월|화|수|목|금|토|일)'
)

BOUND_DAY_TOKEN_PATTERN = (
    rf'(?<![가-힣]){DAY_TOKEN_PATTERN}(?![가-힣])'
)

DAY_SCOPE_RE = re.compile(
    rf'(?:'
    rf'평일|주중|주말'
    rf'|'
    rf'{BOUND_DAY_TOKEN_PATTERN}'
    rf'\s*(?:~|～|−|–|—|-)\s*'
    rf'{BOUND_DAY_TOKEN_PATTERN}'
    rf'|'
    rf'{BOUND_DAY_TOKEN_PATTERN}'
    rf'(?:\s*[,·/]\s*{BOUND_DAY_TOKEN_PATTERN})+'
    rf'|'
    rf'{BOUND_DAY_TOKEN_PATTERN}'
    rf')'
)

DAY_EXCEPTION_RE = re.compile(
    r'(월요일|화요일|수요일|목요일|금요일|토요일|일요일|'
    r'월|화|수|목|금|토|일)'
    r'(?:은|는|에는|의\s*경우)'
    r'.{0,40}?'
    r'(?:준비\s*시간|브레이크\s*타임|휴게\s*시간)'
    r'\s*없이'
)

@dataclass(frozen=True)
class TimeRange:
    start: str
    end: str

@dataclass
class WeeklyRow:
    day_of_week: int
    is_closed: bool
    is_24_hours: bool
    open_time: Optional[str]
    close_time: Optional[str]
    break_start_time: Optional[str]
    break_end_time: Optional[str]

@dataclass
class ParseResult:
    classification: str
    normalized: bool
    reason: str
    rows: Optional[List[WeeklyRow]] = None


def clean_raw_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = html.unescape(str(value))
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = re.sub(r'(?i)</p\s*>', '\n', text)
    text = re.sub(r'(?i)<p[^>]*>', '', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('\r\n','\n').replace('\r','\n')
    text = re.sub(r'[ \t]+',' ',text)
    text = re.sub(r'\n[ \t]+','\n',text)
    text = re.sub(r'\n{3,}','\n\n',text).strip()
    return text or None


def compact_text(value: Optional[str]) -> str:
    return re.sub(r'\s+',' ',value).strip() if value else ''


def dangerous_reason(value: Optional[str]) -> Optional[str]:
    text = compact_text(value)
    for marker in DANGEROUS_MARKERS:
        if marker in text:
            return f'marker: {marker}'
    if SPECIFIC_DATE_RE.search(text):
        return 'specific calendar date'
    if MONTH_EXCEPTION_RE.search(text):
        return 'month-specific exception'
    return None


def normalize_hhmm(hour: str, minute: str) -> str:
    h, m = int(hour), int(minute)
    if h == 24 and m != 0:
        raise ValueError('24 hour only valid as 24:00')
    return f'{h:02d}:{m:02d}:00'


def make_range(groups: Sequence[str]) -> TimeRange:
    return TimeRange(normalize_hhmm(groups[0],groups[1]), normalize_hhmm(groups[2],groups[3]))


def find_time_ranges(text: Optional[str]) -> List[TimeRange]:
    if not text:
        return []
    out = []
    for m in TIME_RANGE_RE.finditer(text):
        try:
            out.append(make_range(m.groups()))
        except ValueError:
            pass
    return out


def find_break_ranges(text: Optional[str]) -> List[TimeRange]:
    if not text:
        return []
    out = []
    for m in BREAK_RE.finditer(text):
        try:
            out.append(make_range(m.groups()))
        except ValueError:
            pass
    return out


def minute_of_day(value: str) -> int:
    h,m,*_ = value.split(':')
    return int(h)*60 + int(m)


def valid_non_overnight(r: TimeRange) -> bool:
    if r.start.startswith('24:') or r.end.startswith('24:'):
        return False
    return minute_of_day(r.end) > minute_of_day(r.start)


def remove_ranges(ranges: List[TimeRange], to_remove: Sequence[TimeRange]) -> List[TimeRange]:
    remaining = list(ranges)
    for target in to_remove:
        for i,current in enumerate(remaining):
            if current == target:
                remaining.pop(i)
                break
    return remaining


def is_explicit_24h_text(text: Optional[str]) -> bool:
    if not text:
        return False
    c = compact_text(text)
    if re.search(r'24\s*시간(?:\s*운영|\s*영업|\s*개방)?', c):
        return True
    if re.search(r'상시\s*개방', c):
        return True
    return any(r.start == '00:00:00' and r.end == '24:00:00' for r in find_time_ranges(c))


def pattern_signature(value: Optional[str]) -> str:
    if not value:
        return '<EMPTY>'
    text = compact_text(value)
    text = TIME_RANGE_RE.sub('<RANGE>', text)
    text = SINGLE_TIME_RE.sub('<TIME>', text)
    text = re.sub(r'\b\d{4,}\b','<NUM>',text)
    return text[:237]+'...' if len(text)>240 else text


def first_item(response_payload: Dict[str,Any]) -> Optional[Dict[str,Any]]:
    items = response_payload.get('response',{}).get('body',{}).get('items')
    if not items or not isinstance(items,dict):
        return None
    item = items.get('item')
    if isinstance(item,list):
        return item[0] if item and isinstance(item[0],dict) else None
    return item if isinstance(item,dict) else None


def extract_raw_fields(content_type_id: str, item: Optional[Dict[str,Any]]) -> Tuple[Optional[str],Optional[str]]:
    if not item:
        return None,None
    if content_type_id == '12':
        return clean_raw_text(item.get('usetime')), clean_raw_text(item.get('restdate'))
    if content_type_id == '14':
        return clean_raw_text(item.get('usetimeculture')), clean_raw_text(item.get('restdateculture'))
    if content_type_id == '15':
        return clean_raw_text(item.get('playtime')), None
    if content_type_id == '28':
        return clean_raw_text(item.get('usetimeleports')), clean_raw_text(item.get('restdateleports'))
    if content_type_id == '32':
        cin, cout = clean_raw_text(item.get('checkintime')), clean_raw_text(item.get('checkouttime'))
        parts=[]
        if cin: parts.append(f'입실시간: {cin}')
        if cout: parts.append(f'퇴실시간: {cout}')
        return '\n'.join(parts) if parts else None, None
    if content_type_id == '38':
        return clean_raw_text(item.get('opentime')), clean_raw_text(item.get('restdateshopping'))
    if content_type_id == '39':
        return clean_raw_text(item.get('opentimefood')), clean_raw_text(item.get('restdatefood'))
    return None,None


def day_token_to_num(token: str) -> int:
    token = token.strip()
    if token in DAY_WORD_TO_NUM: return DAY_WORD_TO_NUM[token]
    if token in DAY_TO_NUM: return DAY_TO_NUM[token]
    raise ValueError(token)


def expand_day_range(start: int, end: int) -> Set[int]:
    return set(range(start,end+1)) if start <= end else set(range(start,8)) | set(range(1,end+1))


def parse_day_selector(selector: str) -> Set[int]:
    text = compact_text(selector)
    if re.search(r'(?:평일|주중)',text): return {1,2,3,4,5}
    if '주말' in text: return {6,7}
    days:Set[int] = set()
    for m in DAY_RANGE_RE.finditer(text):
        days |= expand_day_range(day_token_to_num(m.group(1)), day_token_to_num(m.group(2)))
    without = DAY_RANGE_RE.sub(' ',text)
    for word,num in DAY_WORD_TO_NUM.items():
        if word in without: days.add(num)
    for token,num in DAY_TO_NUM.items():
        if re.search(rf'(?<![가-힣]){token}(?![가-힣])', without): days.add(num)
    return days


def parse_rest_days(rest_text: Optional[str]) -> Tuple[str,Set[int],str]:
    if not rest_text:
        return 'EMPTY',set(),'rest text empty'
    text = compact_text(rest_text)
    reason = dangerous_reason(text)
    if reason:
        return 'AMBIGUOUS',set(),f'rest has unsupported exception/rule: {reason}'
    if re.search(r'연중\s*무휴',text):
        if any(w in text for w in ('단,','단 ','제외','휴무','휴관','쉬는')):
            return 'AMBIGUOUS',set(),'annual-open text contains exception wording'
        return 'ALWAYS_OPEN',set(),'explicit annual-open'
    if '매주' in text:
        days = parse_day_selector(text.split('매주',1)[1])
        return ('CLOSED_DAYS',days,'explicit weekly closed day(s)') if days else ('AMBIGUOUS',set(),'contains 매주 but weekday not recognized')
    bare = parse_day_selector(text)
    if bare and re.fullmatch(r'[\s,/&·ㆍ및과와~～\-–—월화수목금토일요일]+',text):
        return 'CLOSED_DAYS',bare,'explicit closed weekday(s)'
    return 'AMBIGUOUS',set(),'rest rule is not a supported weekly rule'


def closed_row(day:int) -> WeeklyRow:
    return WeeklyRow(day,True,False,None,None,None,None)


def hours_row(day:int, main:TimeRange, brk:Optional[TimeRange]=None) -> WeeklyRow:
    return WeeklyRow(day,False,False,main.start,main.end,brk.start if brk else None,brk.end if brk else None)


def hours24_row(day:int) -> WeeklyRow:
    return WeeklyRow(day,False,True,None,None,None,None)


def build_uniform_rows(main:Optional[TimeRange], closed:Set[int], brk:Optional[TimeRange]=None, is24:bool=False) -> List[WeeklyRow]:
    rows=[]
    for day in range(1,8):
        if day in closed: rows.append(closed_row(day))
        elif is24: rows.append(hours24_row(day))
        else:
            assert main is not None
            rows.append(hours_row(day,main,brk))
    return rows


def build_scoped_rows(
    schedules: Dict[int, Tuple[TimeRange, Optional[TimeRange]]],
    closed: Set[int]
) -> List[WeeklyRow]:
    """
    Sparse policy:
    - create rows only for explicitly known open/closed days
    - an explicit weekly closure overrides an operating-hours schedule
      for the same weekday
    """
    rows=[]

    for day in sorted(set(schedules) | set(closed)):
        if day in closed:
            rows.append(closed_row(day))
        else:
            main,brk=schedules[day]
            rows.append(hours_row(day,main,brk))

    return rows


def parse_segment_time(segment:str) -> Tuple[Optional[TimeRange],Optional[TimeRange],Optional[str]]:
    all_ranges=find_time_ranges(segment); breaks=find_break_ranges(segment)
    if len(breaks)>1: return None,None,'multiple break ranges in one segment'
    main_ranges=remove_ranges(all_ranges,breaks)
    if len(main_ranges)!=1: return None,None,f'segment has {len(main_ranges)} main ranges'
    main=main_ranges[0]; brk=breaks[0] if breaks else None
    if not valid_non_overnight(main): return None,None,'main range is overnight/24:00 boundary'
    if brk and not valid_non_overnight(brk): return None,None,'break range is overnight/24:00 boundary'
    return main,brk,None


def parse_weekday_weekend(text:str, closed:Set[int]) -> Optional[ParseResult]:
    labels=[]
    for label in ('평일','주중','주말'):
        for m in re.finditer(label,text): labels.append((m.start(),label))
    labels.sort()
    wl=[x for x in labels if x[1] in ('평일','주중')]; we=[x for x in labels if x[1]=='주말']
    if len(wl)!=1 or len(we)!=1: return None
    first=min(wl[0][0],we[0][0])
    if find_time_ranges(text[:first]):
        return ParseResult('SKIP_MULTI_FACILITY_OR_PREFIX',False,'time ranges exist before weekday/weekend schedule')
    ordered=sorted([(wl[0][0],'WEEKDAY'),(we[0][0],'WEEKEND')])
    p1,k1=ordered[0]; p2,k2=ordered[1]
    parsed={}
    for kind,segment in ((k1,text[p1:p2]),(k2,text[p2:])):
        main,brk,error=parse_segment_time(segment)
        if error: return ParseResult('SKIP_DAY_SCOPE_AMBIGUOUS',False,f'{kind.lower()} segment: {error}')
        parsed[kind]=(main,brk)
    schedules={d:parsed['WEEKDAY'] for d in range(1,6)} | {
        6:parsed['WEEKEND'],
        7:parsed['WEEKEND']
    }
    return ParseResult(
        'PARSE_WEEKDAY_WEEKEND',
        True,
        'explicit weekday/weekend schedules; explicit weekly closures override matching weekdays',
        build_scoped_rows(schedules,closed)
    )

def repair_duplicate_time_separator(text: str) -> str:
    """
    Repair only an obvious duplicated separator between two HH:MM values.

    Example:
      11:00- - 19:00 -> 11:00-19:00

    Do not perform broader fuzzy correction.
    """
    return re.sub(
        r'(?<=\d{2}:\d{2})'
        r'\s*(?:~|～|−|–|—|-)\s*(?:~|～|−|–|—|-)\s*'
        r'(?=\d{1,2}:\d{2})',
        '-',
        text
    )


def extract_multi_day_segments(text: str):
    """
    Split an operating-hours string into multiple explicit weekday scopes.

    Examples:
      평일 11:00~19:00, 토요일 11:00~14:00
      월~금 09:00~18:00, 토요일 10:00~15:00

    Returns:
      [(days, selector, segment), ...]

    Returns [] when fewer than two explicit scopes are present.
    """
    c = compact_text(text)
    matches = list(DAY_SCOPE_RE.finditer(c))

    if len(matches) < 2:
        return []

    # A time range before the first weekday selector means that the weekday
    # wording may merely be an annotation/exception rather than the main
    # schedule structure.
    first_time = TIME_RANGE_RE.search(c)
    if first_time and first_time.start() < matches[0].start():
        return []

    result = []

    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(c)

        selector = m.group(0)
        days = parse_day_selector(selector)

        if not days:
            return []

        segment = c[start:end].strip(' ,;/')

        result.append((days, selector, segment))

    return result


def parse_multi_scoped_schedule(
    text: str,
    rest_kind: str,
    closed: Set[int]
) -> Optional[ParseResult]:
    """
    Parse multiple explicit weekday scopes in one operating-hours string.

    Sparse policy:
    - each scope must have exactly one safely parsable main time range
    - explicitly closed weekdays are stored as CLOSED
    - unspecified weekdays remain absent
    - overlapping scopes are rejected
    - a break appearing only in the final scope is treated as ambiguous,
      because it may actually be a trailing global break applying to all scopes
    """
    segments = extract_multi_day_segments(text)

    if not segments:
        return None
    if DAY_EXCEPTION_RE.search(compact_text(text)):
        return ParseResult(
            'SKIP_DAY_SCOPE_AMBIGUOUS',
            False,
            'weekday-specific break exception detected'
        )

    # Example:
    #   월~금 11:30~21:30 / 토,일 12:00~21:30 /
    #   브레이크타임 15:00~17:30
    #
    # extract_multi_day_segments() attaches everything after the final
    # weekday selector to the final segment. Therefore a trailing break
    # can be incorrectly interpreted as belonging only to the final scope.
    #
    # If there are multiple scopes, no earlier scope has a break, and only
    # the final scope contains a break, we cannot safely determine whether
    # that break is final-scope-only or global. Preserve raw text and skip.
    break_counts = [
        len(find_break_ranges(raw_segment))
        for _, _, raw_segment in segments
    ]

    if (
        len(segments) >= 2
        and break_counts[-1] > 0
        and all(count == 0 for count in break_counts[:-1])
    ):
        return ParseResult(
            'SKIP_DAY_SCOPE_AMBIGUOUS',
            False,
            'break appears only after final weekday scope; may be a trailing global break'
        )

    schedules = {}
    covered_days = set()

    for days, selector, raw_segment in segments:
        if covered_days & days:
            return ParseResult(
                'SKIP_DAY_SCOPE_AMBIGUOUS',
                False,
                f'overlapping weekday scopes around: {selector}'
            )

        # Limited repair for an obvious duplicated separator such as
        # "11:00- - 19:00".
        segment = repair_duplicate_time_separator(raw_segment)

        main, brk, error = parse_segment_time(segment)

        if error:
            return ParseResult(
                'SKIP_DAY_SCOPE_AMBIGUOUS',
                False,
                f'{selector} segment: {error}'
            )

        for day in days:
            schedules[day] = (main, brk)

        covered_days |= days

    if rest_kind == 'ALWAYS_OPEN' and covered_days != set(range(1, 8)):
        return ParseResult(
            'SKIP_CONTRADICTORY',
            False,
            'multi-scoped operating text does not cover all weekdays but rest says 연중무휴'
        )

    rows = build_scoped_rows(
        schedules,
        closed if rest_kind == 'CLOSED_DAYS' else set()
    )

    return ParseResult(
        'PARSE_MULTI_DAY_SCOPE',
        True,
        'multiple explicit weekday scopes parsed independently',
        rows
    )

def extract_single_day_scope(text:str) -> Tuple[Optional[Set[int]],bool]:
    """
    Detect a weekday scope only when it appears BEFORE the first time range.
    This avoids misreading annotations such as:
      10:00~18:00 ※ 토요일의 경우 사전예약...
    as a Saturday-only schedule.
    """
    c=compact_text(text)
    first_time=TIME_RANGE_RE.search(c)
    scope_text=c[:first_time.start()] if first_time else c
    candidates=[]
    for alias,days in (('평일',{1,2,3,4,5}),('주중',{1,2,3,4,5}),('주말',{6,7})):
        if alias in scope_text:
            candidates.append((days,bool(re.search(rf'{alias}\s*만',scope_text))))
    for m in DAY_RANGE_RE.finditer(scope_text):
        days=expand_day_range(day_token_to_num(m.group(1)),day_token_to_num(m.group(2)))
        candidates.append((days,'만' in scope_text[m.end():m.end()+5]))
    if not candidates:
        found={num for word,num in DAY_WORD_TO_NUM.items() if word in scope_text}
        if len(found)==1: candidates.append((found,'만' in scope_text))
    unique={(tuple(sorted(days)),only) for days,only in candidates}
    if len(unique)!=1: return None,False
    days,only=next(iter(unique)); return set(days),only


def has_leading_day_scope(text:str) -> bool:
    days,_=extract_single_day_scope(text)
    return bool(days)


def has_any_day_wording(text:str) -> bool:
    c=compact_text(text)
    return bool(
        '평일' in c or '주중' in c or '주말' in c
        or DAY_RANGE_RE.search(c)
        or any(word in c for word in DAY_WORD_TO_NUM)
    )


def parse_single_scoped_schedule(text:str, rest_kind:str, closed:Set[int]) -> Optional[ParseResult]:
    """
    Sparse policy:
    - Store explicitly stated open days.
    - Store CLOSED only for days explicitly stated in rest_days_raw.
    - Missing days remain absent/unknown.
    """
    open_days,_only=extract_single_day_scope(text)
    if not open_days: return None
    ranges=find_time_ranges(text); breaks=find_break_ranges(text)
    if len(breaks)>1: return ParseResult('SKIP_DAY_SCOPE_AMBIGUOUS',False,'multiple break ranges in scoped schedule')
    mains=remove_ranges(ranges,breaks)
    if len(mains)!=1: return ParseResult('SKIP_DAY_SCOPE_AMBIGUOUS',False,f'scoped schedule has {len(mains)} main ranges')
    main=mains[0]; brk=breaks[0] if breaks else None
    if not valid_non_overnight(main): return ParseResult('SKIP_DAY_SCOPE_AMBIGUOUS',False,'scoped schedule uses overnight/24:00 boundary')
    if brk and not valid_non_overnight(brk): return ParseResult('SKIP_DAY_SCOPE_AMBIGUOUS',False,'scoped break uses overnight/24:00 boundary')
    if rest_kind=='ALWAYS_OPEN' and open_days != set(range(1,8)):
        return ParseResult('SKIP_CONTRADICTORY',False,'day-scoped operating text contradicts 연중무휴')
    schedules={d:(main,brk) for d in open_days}
    return ParseResult(
        'PARSE_SINGLE_DAY_SCOPE',True,
        'sparse explicit day scope; unspecified weekdays omitted',
        build_scoped_rows(schedules,closed if rest_kind=='CLOSED_DAYS' else set())
    )


def parse_weekly_schedule(content_type_id:str, operating_text:Optional[str], rest_text:Optional[str]) -> ParseResult:
    # Event/lodging fields are not weekly opening-hour schedules.
    if content_type_id=='15':
        return ParseResult('RAW_ONLY_EVENT',False,'event playtime is not a recurring weekly place schedule')
    if content_type_id=='32':
        return ParseResult('RAW_ONLY_LODGING',False,'check-in/out is not a recurring weekly place schedule')

    rest_kind,closed,rest_reason=parse_rest_days(rest_text)

    # If operating time is absent, explicit weekly closures are still useful
    # under sparse semantics. Do not invent open rows.
    if not operating_text:
        if rest_kind=='CLOSED_DAYS' and closed:
            return ParseResult(
                'PARSE_CLOSED_DAYS_ONLY',True,
                'weekly closed day(s) explicitly known; open days unknown',
                [closed_row(d) for d in sorted(closed)]
            )
        return ParseResult('NO_TIME_TEXT',False,'operating text empty')

    reason=dangerous_reason(operating_text)
    if reason:
        return ParseResult('SKIP_TIME_AMBIGUOUS',False,f'operating text has unsupported rule: {reason}')

    text=compact_text(operating_text)

    # Explicit 24h/always-open wording is self-sufficient.
    # EMPTY rest means 7-day 24H; explicit weekly closures override those days.
    if is_explicit_24h_text(text):
        if rest_kind=='AMBIGUOUS':
            return ParseResult('SKIP_REST_AMBIGUOUS',False,rest_reason)
        ranges=find_time_ranges(text)
        non24=[r for r in ranges if not (r.start=='00:00:00' and r.end=='24:00:00')]
        if non24:
            return ParseResult('SKIP_TIME_AMBIGUOUS',False,'24-hour wording mixed with other time ranges')
        if rest_kind in ('EMPTY','ALWAYS_OPEN'):
            closed=set()
        return ParseResult(
            'PARSE_24_HOURS',True,
            'explicit 24-hour/always-open wording',
            build_uniform_rows(None,closed,is24=True)
        )

    # From here, ambiguous rest still blocks normalization. EMPTY is allowed only
    # when operating text itself has an explicit weekday scope.
    if rest_kind=='AMBIGUOUS':
        return ParseResult('SKIP_REST_AMBIGUOUS',False,rest_reason)

    if (('평일' in text or '주중' in text) and '주말' in text):
        # Both scopes cover all 7 days, so EMPTY rest is safe.
        result=parse_weekday_weekend(text,closed)
        if result is not None:
            return result

    multi_result = parse_multi_scoped_schedule(
        text,
        rest_kind,
        closed
    )
    if multi_result is not None:
        return multi_result

    has_day_scope=has_leading_day_scope(text)
    if has_day_scope:
        result=parse_single_scoped_schedule(text,rest_kind,closed)
        if result is not None: return result
        return ParseResult('SKIP_DAY_SCOPE_AMBIGUOUS',False,'weekday-specific wording exists but could not be safely normalized')

    # Weekday wording that appears only after the main time range is treated as
    # a day-specific note/exception, not as a clean leading schedule scope.
    if has_any_day_wording(text):
        return ParseResult('SKIP_DAY_SCOPE_AMBIGUOUS',False,'weekday-specific note appears outside a supported leading schedule scope')

    # Generic time without rest info does not tell us which weekdays it applies to.
    if rest_kind=='EMPTY':
        return ParseResult('SKIP_REST_AMBIGUOUS',False,'generic operating time has no rest/day-scope information')

    ranges=find_time_ranges(text); breaks=find_break_ranges(text)
    if len(breaks)>1: return ParseResult('SKIP_TIME_AMBIGUOUS',False,'multiple break ranges')
    mains=remove_ranges(ranges,breaks)
    if len(mains)!=1: return ParseResult('SKIP_TIME_AMBIGUOUS',False,f'expected exactly 1 main range after break extraction, found {len(mains)}')
    main=mains[0]; brk=breaks[0] if breaks else None
    if not valid_non_overnight(main): return ParseResult('SKIP_TIME_AMBIGUOUS',False,'overnight/24:00 boundary not representable without next-day flag')
    if brk and not valid_non_overnight(brk): return ParseResult('SKIP_TIME_AMBIGUOUS',False,'break range is overnight/24:00 boundary')
    return ParseResult('PARSE_SIMPLE_WEEKLY',True,'single time range + supported rest rule',build_uniform_rows(main,closed,brk))


def db():
    return psycopg.connect(DATABASE_URL,row_factory=dict_row)


def fetch_latest_detail_intro(conn):
    return conn.execute('''
        WITH src AS (SELECT id AS source_id FROM external_sources WHERE code='TOUR_API'),
        latest AS (
          SELECT DISTINCT ON (r.content_id) r.id raw_id,r.content_id,r.content_type_id,r.response_payload,r.fetched_at
          FROM raw_tour_api r
          WHERE r.endpoint='detailIntro2' AND r.content_id IS NOT NULL
          ORDER BY r.content_id,r.fetched_at DESC,r.id DESC
        )
        SELECT l.*,pei.place_id,p.name place_name
        FROM latest l CROSS JOIN src
        LEFT JOIN place_external_ids pei ON pei.source_id=src.source_id AND pei.id_type='CONTENT_ID' AND pei.external_id=l.content_id
        LEFT JOIN places p ON p.id=pei.place_id
        ORDER BY l.content_id
    ''').fetchall()


def fetch_places_with_user_hours(conn) -> Set[int]:
    return {int(r['place_id']) for r in conn.execute('SELECT DISTINCT place_id FROM place_operating_hours WHERE updated_by_user_id IS NOT NULL').fetchall()}


def update_place_raw_fields(conn,place_id:int,operating_raw:Optional[str],rest_raw:Optional[str]):
    conn.execute('UPDATE places SET operating_hours_raw=%s, rest_days_raw=%s WHERE id=%s',(operating_raw,rest_raw,place_id))


def delete_system_hours_for_places(conn, place_ids:Set[int]) -> int:
    """One-time/full-reconcile helper. User-edited rows are never deleted."""
    if not place_ids:
        return 0
    result=conn.execute(
        'DELETE FROM place_operating_hours WHERE updated_by_user_id IS NULL AND place_id = ANY(%s)',
        (list(sorted(place_ids)),)
    )
    return result.rowcount


def upsert_weekly_rows(conn,place_id:int,rows:List[WeeklyRow]) -> int:
    written=0
    for row in rows:
        result=conn.execute('''
          INSERT INTO place_operating_hours(
            place_id,day_of_week,is_closed,is_24_hours,open_time,close_time,break_start_time,break_end_time,updated_by_user_id,updated_at
          ) VALUES(%s,%s,%s,%s,%s::time,%s::time,%s::time,%s::time,NULL,NOW())
          ON CONFLICT(place_id,day_of_week) DO UPDATE SET
            is_closed=EXCLUDED.is_closed,
            is_24_hours=EXCLUDED.is_24_hours,
            open_time=EXCLUDED.open_time,
            close_time=EXCLUDED.close_time,
            break_start_time=EXCLUDED.break_start_time,
            break_end_time=EXCLUDED.break_end_time,
            updated_at=NOW()
          WHERE place_operating_hours.updated_by_user_id IS NULL
        ''',(place_id,row.day_of_week,row.is_closed,row.is_24_hours,row.open_time,row.close_time,row.break_start_time,row.break_end_time))
        written += result.rowcount
    return written


def row_display(row:WeeklyRow) -> str:
    if row.is_closed: return 'CLOSED'
    if row.is_24_hours: return '24H'
    s=f'{row.open_time[:5]}-{row.close_time[:5]}'
    if row.break_start_time and row.break_end_time: s += f' / BREAK {row.break_start_time[:5]}-{row.break_end_time[:5]}'
    return s


def normalized_week_display(rows:Optional[List[WeeklyRow]]) -> Dict[str,str]:
    out={name:'' for name in NUM_TO_DAY_NAME.values()}
    if rows:
        for row in rows: out[NUM_TO_DAY_NAME[row.day_of_week]]=row_display(row)
    return out


def normalized_summary(rows:Optional[List[WeeklyRow]]) -> str:
    return ' | '.join(f'{NUM_TO_DAY_NAME[r.day_of_week]}={row_display(r)}' for r in rows) if rows else ''


def write_csv(rows,path,fields):
    with path.open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--apply',action='store_true')
    ap.add_argument(
        '--replace-system-hours',
        action='store_true',
        help='With --apply, delete existing system-generated rows for the current mapped TourAPI dataset before inserting the newly parsed sparse rows. User-edited rows are protected.'
    )
    args=ap.parse_args()
    if args.replace_system_hours and not args.apply:
        ap.error('--replace-system-hours requires --apply')

    REPORT_DIR.mkdir(parents=True,exist_ok=True); stamp=datetime.now().strftime('%Y%m%d_%H%M%S')
    audit_path=REPORT_DIR/f'operating_hours_audit_{stamp}.csv'
    review_path=REPORT_DIR/f'normalized_candidates_review_{stamp}.csv'
    pattern_path=REPORT_DIR/f'operating_hours_patterns_{stamp}.csv'

    with db() as conn:
        raw_rows=fetch_latest_detail_intro(conn); user_edited=fetch_places_with_user_hours(conn)
        audit=[]; patterns=Counter(); classes=Counter(); types=Counter()
        parsed_by_place={}
        with_item=no_data=mapped=unmapped=normalized=0
        raw_updated=normalized_places=structured_rows=protected=deleted_system_rows=0

        for raw in raw_rows:
            cid=str(raw['content_id']); ctid=str(raw['content_type_id'] or '')
            pid=int(raw['place_id']) if raw['place_id'] is not None else None
            item=first_item(raw['response_payload'])
            with_item += item is not None; no_data += item is None; mapped += pid is not None; unmapped += pid is None
            op,rest=extract_raw_fields(ctid,item)
            if item is None: parsed=ParseResult('NO_DATA',False,'detailIntro2 returned no item')
            elif pid is None: parsed=ParseResult('NO_PLACE_MAPPING',False,'CONTENT_ID not mapped to place')
            else: parsed=parse_weekly_schedule(ctid,op,rest)
            normalized += parsed.normalized
            week=normalized_week_display(parsed.rows)
            op_sig,rest_sig=pattern_signature(op),pattern_signature(rest)
            classes[parsed.classification]+=1; types[ctid]+=1; patterns[(ctid,parsed.classification,op_sig,rest_sig)]+=1
            audit.append({
                'content_id':cid,'content_type_id':ctid,'place_id':pid or '','place_name':raw['place_name'] or '',
                'has_item':item is not None,'operating_raw':op or '','rest_raw':rest or '',
                'classification':parsed.classification,'normalized_candidate':parsed.normalized,'reason':parsed.reason,
                'normalized_summary':normalized_summary(parsed.rows),**week,
                'operating_pattern':op_sig,'rest_pattern':rest_sig
            })
            if pid is not None:
                parsed_by_place[pid]=(op,rest,parsed)

        fields=['content_id','content_type_id','place_id','place_name','has_item','operating_raw','rest_raw','classification','normalized_candidate','reason','normalized_summary','MON','TUE','WED','THU','FRI','SAT','SUN','operating_pattern','rest_pattern']
        write_csv(audit,audit_path,fields)
        review_fields=['content_id','content_type_id','place_id','place_name','operating_raw','rest_raw','classification','reason','normalized_summary','MON','TUE','WED','THU','FRI','SAT','SUN','review']
        review=[]
        for r in audit:
            if r['normalized_candidate']:
                x={k:r.get(k,'') for k in review_fields}; x['review']=''; review.append(x)
        write_csv(review,review_path,review_fields)
        with pattern_path.open('w',newline='',encoding='utf-8-sig') as f:
            w=csv.DictWriter(f,fieldnames=['content_type_id','classification','operating_pattern','rest_pattern','count']); w.writeheader()
            for key,count in patterns.most_common():
                c,cl,o,r=key; w.writerow({'content_type_id':c,'classification':cl,'operating_pattern':o,'rest_pattern':r,'count':count})

        if args.apply:
            # Raw fallback update for current mapped rows.
            for pid,(op,rest,parsed) in parsed_by_place.items():
                update_place_raw_fields(conn,pid,op,rest); raw_updated += 1

            # Full reconcile is required when switching from dense 7-row policy to sparse rows.
            if args.replace_system_hours:
                replace_ids=set(parsed_by_place) - user_edited
                deleted_system_rows=delete_system_hours_for_places(conn,replace_ids)

            for pid,(op,rest,parsed) in parsed_by_place.items():
                if not (parsed.normalized and parsed.rows):
                    continue
                if pid in user_edited:
                    protected += 1
                    continue
                n=upsert_weekly_rows(conn,pid,parsed.rows)
                if n>0:
                    normalized_places += 1
                    structured_rows += n

            conn.commit()
        else:
            conn.rollback()

    print('\n========================================\n TourAPI operating-hours analysis v3 (sparse rows)\n========================================')
    print(f'latest detailIntro2 rows : {len(raw_rows)}\nwith item               : {with_item}\nno data                 : {no_data}\nmapped to places        : {mapped}\nunmapped                : {unmapped}\nnormalized candidates   : {normalized}\n')
    print('[BY CONTENT TYPE]')
    for k,v in sorted(types.items(), key=lambda x:(int(x[0]) if x[0].isdigit() else 999,x[0])): print(f'  type {k or "<NULL>":>4}: {v}')
    print('\n[CLASSIFICATION]')
    for k,v in classes.most_common(): print(f'  {k:<32} {v}')
    print('\n[TOP 20 PATTERNS]')
    for i,(key,count) in enumerate(patterns.most_common(20),1):
        c,cl,o,r=key; print(f'{i:>2}. type={c:<2} count={count:<4} class={cl}\n    op   : {o}\n    rest : {r}')
    print(f'\naudit report    : {audit_path}\npattern report  : {pattern_path}\ncandidate review: {review_path}')
    if args.apply:
        print(f'\n[DB APPLY]\nraw place fields updated     : {raw_updated}\nsystem rows deleted         : {deleted_system_rows}\nnormalized places written    : {normalized_places}\nstructured rows written      : {structured_rows}\nuser-edited places protected : {protected}\n\n[DONE] DB changes committed.')
    else:
        print('\n[DRY RUN] No DB rows were changed. Review candidate review CSV before --apply.')
        print('When approved, use --apply --replace-system-hours once to migrate existing dense system rows to sparse policy.')

if __name__=='__main__':
    main()
